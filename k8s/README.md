# Deploy to Azure AKS

This directory ships a minimal set of manifests for running the
benchmark on AKS using Workload Identity so users can hit the page
and have requests flow to Azure OpenAI with zero client-side setup.

## Prereqs

- AKS cluster with the **OIDC Issuer** and **Workload Identity**
  features enabled:
  ```bash
  az aks update -g <rg> -n <aks> \
      --enable-oidc-issuer --enable-workload-identity
  ```
- `kubectl` pointed at the cluster (`az aks get-credentials -g <rg> -n <aks>`).
- A container registry the cluster can pull from (e.g. ACR).

## 1. Build and push the image

```bash
az acr login -n <acr>
docker build -t <acr>.azurecr.io/aoai-benchmark:v1 .
docker push <acr>.azurecr.io/aoai-benchmark:v1
```

## 2. Create a User-Assigned Managed Identity and federate it

```bash
RG=<rg>
AKS=<aks-cluster-name>
UAMI=aoai-benchmark-uami
SUB=$(az account show --query id -o tsv)

# Create the UAMI
az identity create -g "$RG" -n "$UAMI"
CLIENT_ID=$(az identity show -g "$RG" -n "$UAMI" --query clientId -o tsv)
OBJECT_ID=$(az identity show -g "$RG" -n "$UAMI" --query principalId -o tsv)

# Grant the UAMI "Cognitive Services User" on your target AOAI resource(s).
# You can scope this to one resource, a resource group, or the subscription.
AOAI_RG=<rg-holding-aoai>
AOAI_NAME=<aoai-account-name>
AOAI_ID=$(az cognitiveservices account show -g "$AOAI_RG" -n "$AOAI_NAME" --query id -o tsv)
az role assignment create \
    --role "Cognitive Services User" \
    --assignee-object-id "$OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --scope "$AOAI_ID"

# (Optional) If you also want /api/resources/discover to auto-list
# AOAI accounts in the subscription, give it Reader on the scope you
# want searched:
az role assignment create \
    --role "Reader" \
    --assignee-object-id "$OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --scope "/subscriptions/$SUB"

# Federate the UAMI to this Service Account
ISSUER=$(az aks show -g "$RG" -n "$AKS" --query oidcIssuerProfile.issuerUrl -o tsv)
az identity federated-credential create \
    --name aoai-benchmark-fed \
    --identity-name "$UAMI" \
    --resource-group "$RG" \
    --issuer "$ISSUER" \
    --subject "system:serviceaccount:aoai-benchmark:aoai-benchmark-sa" \
    --audiences api://AzureADTokenExchange
```

Record `CLIENT_ID` — you'll patch the ServiceAccount annotation with it
in the next step.

## 3. Apply manifests

```bash
# Replace the two placeholders
cd k8s/
sed -i '' "s|REPLACE_WITH_UAMI_CLIENT_ID|$CLIENT_ID|" serviceaccount.yaml
sed -i '' "s|REPLACE_WITH_IMAGE:latest|<acr>.azurecr.io/aoai-benchmark:v1|" deployment.yaml
# Or override in kustomization.yaml instead.

kubectl apply -k .
kubectl -n aoai-benchmark rollout status deploy/aoai-benchmark
kubectl -n aoai-benchmark get pods
```

## 4. (Optional) Provide an API key fallback

If you'd like the benchmark to also work against Azure OpenAI resources
where the MI has no permission, create a Secret so the pod can use a key:

```bash
kubectl -n aoai-benchmark create secret generic aoai-benchmark-secrets \
    --from-literal=AZURE_OPENAI_API_KEY="<key>"
```

The Deployment already marks this env var `optional: true` — the pod
starts fine with or without it.

## 5. Verify

Hit the ingress URL in a browser. On the page's auth bar you should see
**"AKS Workload Identity"** and running a benchmark against a permitted
endpoint should work without pasting anything.

To sanity-check from the shell:

```bash
kubectl -n aoai-benchmark port-forward svc/aoai-benchmark 8088:80
curl localhost:8088/healthz        # {"status":"ok"}
curl localhost:8088/readyz         # {"ready":true,"method":"workload_identity",...}
curl localhost:8088/api/auth/status
```

## 6. (Optional) Enable browser MSAL.js SSO (per-user identity)

With Workload Identity, **every** request uses the pod's identity. If you
want each user to authenticate with their own Entra ID and call AOAI under
their own quota, register a small SPA App Registration and turn on MSAL.

> **What the user actually sees.** MSAL does **not** read `~/.azure/` on the
> user's laptop — it uses the **browser's** existing Entra ID session cookie.
> If they're already signed into Azure Portal in this browser, "Sign in with
> Azure AD" is silent (no popup). If not, they see one Microsoft login
> popup, then silent for ~1h. The signed-in account is whoever is logged into
> *the browser*, which may differ from `az account show`.

```bash
APP_NAME=aoai-benchmark-spa
PUBLIC_URL=https://bench.zeno.ink     # <-- your Ingress hostname

# Create a multi-tenant SPA App Registration
APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMultipleOrgs \
    --query appId -o tsv)

# Add a SPA redirect URI (browser-flow PKCE). The JSON form is deliberate —
# `az ad app create` doesn't set SPA redirect URIs correctly otherwise.
az rest --method PATCH \
    --uri "https://graph.microsoft.com/v1.0/applications(appId='${APP_ID}')" \
    --headers "Content-Type=application/json" \
    --body "{\"spa\":{\"redirectUris\":[\"${PUBLIC_URL}\"]}}"

# Grant the app permission to call Azure OpenAI on behalf of the user.
# We look the "Azure Cognitive Services" API resource up dynamically so we
# don't hard-code an appId that drifts.
COGNITIVE_APP_ID=$(az ad sp list --filter "servicePrincipalNames/any(n:n eq 'https://cognitiveservices.azure.com')" \
    --query "[0].appId" -o tsv)
USER_IMPERSONATION=$(az ad sp show --id "$COGNITIVE_APP_ID" \
    --query "oauth2PermissionScopes[?value=='user_impersonation'].id | [0]" -o tsv)

az ad app permission add --id "$APP_ID" \
    --api "$COGNITIVE_APP_ID" \
    --api-permissions "${USER_IMPERSONATION}=Scope"

# Optionally: admin-consent for YOUR home tenant so users don't see a
# consent prompt on first sign-in. Requires Global/Application Admin.
az ad app permission grant --id "$APP_ID" \
    --api "$COGNITIVE_APP_ID" --scope user_impersonation

echo "Set this in the ConfigMap:"
echo "  AAD_CLIENT_ID=$APP_ID"
```

Then:

```bash
kubectl -n aoai-benchmark set env configmap/aoai-benchmark-config AAD_CLIENT_ID="$APP_ID"
kubectl -n aoai-benchmark rollout restart deploy/aoai-benchmark
```

The UI will now show a **"Sign in with Azure AD"** button. Once a user
signs in, the browser silently acquires an access token for Azure OpenAI
and every benchmark request runs under their identity.

### External-tenant guests

Users from tenants other than yours can sign in (multi-tenant app), but
their tenant admin will still need to approve the permission. The user
sees a standard Microsoft consent screen on first sign-in — no action
needed on our side.

## Notes

- CORS: since FastAPI serves the Next.js static export in-process, there is
  no cross-origin call from the browser. `ALLOWED_ORIGINS` only matters if
  you front the app with a separate domain or run Next.js standalone.
- If you don't want discovery: set `AZURE_SUBSCRIPTION_ID=""` and skip the
  Reader role — the page will simply prompt users to paste endpoints.
- To rotate the image, re-push a new tag and:
  `kubectl -n aoai-benchmark set image deploy/aoai-benchmark app=<acr>.azurecr.io/aoai-benchmark:v2`
- Auth priority inside the pod: explicit `Authorization: Bearer` header
  (MSAL.js user token) → manual API key from the form → DefaultAzureCredential
  (Workload Identity / Managed Identity) → `AZURE_OPENAI_API_KEY` env.

## One-shot redeploy

Once the cluster is initially bootstrapped, day-to-day rollouts after a
code change are a single command via the helper at
[`scripts/build-and-deploy.sh`](../scripts/build-and-deploy.sh):

```bash
ACR=<your-acr-name> ./scripts/build-and-deploy.sh
```

It builds the image for `linux/amd64` (AKS x86 pools), pushes to ACR, and
rolls the Deployment. Override with env vars if your naming differs:

| Env | Default |
|-----|---------|
| `ACR` | *(required, e.g. `myregistry`)* |
| `TAG` | `git rev-parse --short HEAD` |
| `IMAGE_NAME` | `aoai-benchmark` |
| `NAMESPACE` | `aoai-benchmark` |
| `DEPLOY` | `aoai-benchmark` |
| `CONTAINER` | `app` |
| `PLATFORM` | `linux/amd64` |
| `SKIP_LOGIN` | *(unset)* — set to any value to skip `az acr login` |
| `SKIP_ROLLOUT` | *(unset)* — set to push only, no kubectl |
| `DRY_RUN` | *(unset)* — set to any value to print commands only |

If you're running this against an in-cluster UAMI that has **not** yet
been set up (i.e., `k8s/serviceaccount.yaml` still has the
`REPLACE_WITH_UAMI_CLIENT_ID` placeholder), the new image handles it
gracefully: WorkloadIdentity is skipped automatically, `/readyz` stays
green, and Auto Discover surfaces a one-line "please enter endpoint
manually" instead of the raw AADSTS700016 dump.
