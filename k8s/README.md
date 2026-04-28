# Deploy to Azure AKS

This directory ships a minimal set of manifests for running the benchmark
on AKS. **Default auth model**: users authenticate themselves from the
browser — either by pasting an Entra ID App Registration's client id +
tenant into the UI (SSO), or by pasting an endpoint + API key manually.
The pod has no long-lived Azure credentials of its own.

The Workload Identity / UAMI path from earlier docs is still supported but
now optional — see [Optional: pod-level identity](#optional-pod-level-identity)
below.

## Prereqs

- `kubectl` pointed at the target cluster
  (`az aks get-credentials -g <rg> -n <aks>`).
- A container registry the cluster can pull from (e.g. ACR).

## 1. Build and push the image

Any registry the cluster can pull from works. Example with ACR:

```bash
az acr login -n <acr>
docker build --platform linux/amd64 -t <acr>.azurecr.io/aoai-benchmark:v1 .
docker push <acr>.azurecr.io/aoai-benchmark:v1
```

If you want a one-shot local-machine build+push+roll helper, the repo
ships `scripts/build-and-deploy.sh`. It's optional — skip it if you
deploy via CI/GitOps/other tooling.

## 2. Apply manifests

```bash
cd k8s/
sed -i '' "s|REPLACE_WITH_IMAGE:latest|<acr>.azurecr.io/aoai-benchmark:v1|" deployment.yaml
kubectl apply -k .
kubectl -n aoai-benchmark rollout status deploy/aoai-benchmark
```

That's it. The ServiceAccount still ships with a `REPLACE_WITH_UAMI_CLIENT_ID`
annotation for future use, but with the Workload Identity label off the
Deployment, the webhook ignores it and the placeholder never reaches Azure AD.

## 3. Verify

Open the ingress URL. In the Authentication bar the user picks one of:

- **Configure SSO** → paste their own Entra ID App Registration's client id
  and tenant id → click **Save & Sign in**. The browser acquires a token
  for ARM (for Auto Discovery) and Cognitive Services (for benchmark
  calls), both under the user's own identity.
- *Or* leave SSO unconfigured and use the **Manual Entry** tab to paste
  endpoint + API key.

From the shell the backend is always reachable without any Azure context:
```bash
kubectl -n aoai-benchmark port-forward svc/aoai-benchmark 8088:80
curl localhost:8088/healthz                   # {"status":"ok"}
curl localhost:8088/readyz                    # HTTP 200 regardless
curl localhost:8088/api/resources/discover    # {"resources":[],"error":"..."} without a token — expected
```

## Optional: pod-level identity

Two scenarios where you *do* want a pod-level identity:
1. You want Auto Discovery to work for users who haven't signed in yet
   (e.g. a landing page experience).
2. You're running in a trusted environment and prefer a single service
   identity over per-user tokens.

In either case, follow [Legacy: Workload Identity path](#legacy-workload-identity-path)
below. You'll create a UAMI, federate it to the ServiceAccount, patch the
annotation with a real client id, and re-enable the
`azure.workload.identity/use: "true"` label on the Deployment.

## Legacy: Workload Identity path

> **Prereq**: AKS cluster with OIDC Issuer + Workload Identity enabled:
> `az aks update -g <rg> -n <aks> --enable-oidc-issuer --enable-workload-identity`

### Create a User-Assigned Managed Identity and federate it

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

Record `CLIENT_ID` — you'll patch the ServiceAccount annotation with it.

### Enable the Workload Identity path

Two edits, then roll:
```bash
# 1. Put the real client id in the SA annotation
kubectl -n aoai-benchmark annotate sa aoai-benchmark-sa \
    azure.workload.identity/client-id=$CLIENT_ID --overwrite

# 2. Put the label back on the Deployment pod template
kubectl -n aoai-benchmark patch deploy aoai-benchmark --type=json -p='[
  {"op":"add","path":"/spec/template/metadata/labels/azure.workload.identity~1use","value":"true"}
]'

kubectl -n aoai-benchmark rollout restart deploy/aoai-benchmark
```

After this, the pod has an identity. `/api/resources/discover` without a
user bearer token will fall through to that identity (whatever subscriptions
its RBAC grants). Per-user browser SSO tokens still take priority.

### (Optional) API key fallback

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

## 6. Provisioning an Entra ID App Registration (for SSO users)

Users who want SSO need an App Registration. This is a one-time setup by
someone with tenant permissions; any user who owns the `client_id` +
`tenant_id` can then type them into the UI and sign in. Nothing about the
App Registration lives on the server — no env vars, no ConfigMap entries.

> **What the user actually sees.** MSAL does **not** read `~/.azure/` on the
> user's laptop — it uses the **browser's** existing Entra ID session cookie.
> If they're already signed into Azure Portal in this browser, sign-in is
> silent (no popup). If not, they see one Microsoft login popup, then silent
> for ~1h. The signed-in account is whoever is logged into *the browser*,
> which may differ from `az account show`.

```bash
APP_NAME=aoai-benchmark-spa
PUBLIC_URL=https://<your-ingress-host>     # <-- your Ingress hostname

# 1. Create a multi-tenant SPA App Registration
APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMultipleOrgs \
    --query appId -o tsv)

# 2. Add a SPA redirect URI (browser PKCE flow). The JSON form is deliberate —
#    `az ad app create` doesn't set SPA redirect URIs correctly otherwise.
az rest --method PATCH \
    --uri "https://graph.microsoft.com/v1.0/applications(appId='${APP_ID}')" \
    --headers "Content-Type=application/json" \
    --body "{\"spa\":{\"redirectUris\":[\"${PUBLIC_URL}\"]}}"

# 3. Grant delegated permissions for:
#      - Azure Service Management (for Auto Discovery against ARM)
#      - Azure Cognitive Services / OpenAI (for benchmark data-plane calls)
ARM_APP_ID=$(az ad sp list --filter "servicePrincipalNames/any(n:n eq 'https://management.azure.com')" \
    --query "[0].appId" -o tsv)
ARM_SCOPE=$(az ad sp show --id "$ARM_APP_ID" \
    --query "oauth2PermissionScopes[?value=='user_impersonation'].id | [0]" -o tsv)

COGNITIVE_APP_ID=$(az ad sp list --filter "servicePrincipalNames/any(n:n eq 'https://cognitiveservices.azure.com')" \
    --query "[0].appId" -o tsv)
COGNITIVE_SCOPE=$(az ad sp show --id "$COGNITIVE_APP_ID" \
    --query "oauth2PermissionScopes[?value=='user_impersonation'].id | [0]" -o tsv)

az ad app permission add --id "$APP_ID" --api "$ARM_APP_ID" \
    --api-permissions "${ARM_SCOPE}=Scope"
az ad app permission add --id "$APP_ID" --api "$COGNITIVE_APP_ID" \
    --api-permissions "${COGNITIVE_SCOPE}=Scope"

# 4. (Optional) Admin-consent so users in your tenant don't see a consent
#    prompt on first sign-in. Requires Global/Application Admin.
az ad app permission grant --id "$APP_ID" --api "$ARM_APP_ID" --scope user_impersonation
az ad app permission grant --id "$APP_ID" --api "$COGNITIVE_APP_ID" --scope user_impersonation

TENANT_ID=$(az account show --query tenantId -o tsv)
echo ""
echo "Share these with your users — they paste them into the UI's Configure SSO dialog:"
echo "  Application (client) ID: $APP_ID"
echo "  Directory (tenant) ID:   $TENANT_ID   # or 'organizations' for multi-tenant"
```

Users then:

1. Open the deployed site.
2. Click **Configure SSO** in the Authentication bar.
3. Paste the `client_id` and `tenant_id` into the dialog.
4. Sign in. Auto Discover lists the resources visible to their identity;
   benchmark calls run under their own RBAC.

### External-tenant guests

Users from tenants other than yours can sign in (multi-tenant app), but
their tenant admin will still need to approve the permission. The user
sees a standard Microsoft consent screen on first sign-in — no action
needed on the server side.

## Notes

- CORS: since FastAPI serves the Next.js static export in-process, there is
  no cross-origin call from the browser. `ALLOWED_ORIGINS` only matters if
  you front the app with a separate domain or run Next.js standalone.
- If you don't want discovery: set `AZURE_SUBSCRIPTION_ID=""` and skip the
  Reader role — the page will simply prompt users to paste endpoints.
- To rotate the image, re-push a new tag and:
  `kubectl -n aoai-benchmark set image deploy/aoai-benchmark app=<acr>.azurecr.io/aoai-benchmark:v2`
- Auth priority inside the pod: explicit `Authorization: Bearer` header
  (browser MSAL.js token for either ARM or Cognitive Services scope) →
  manual API key from the UI form → `DefaultAzureCredential` (Workload
  Identity / Managed Identity / `az login` on the host) →
  `AZURE_OPENAI_API_KEY` env var.

## Optional: one-shot local redeploy helper

The repo includes [`scripts/build-and-deploy.sh`](../scripts/build-and-deploy.sh)
as a local-machine convenience wrapper. It is **not required** — use it
only if your deployment flow is "run a script from your laptop". CI
pipelines, GitOps, and other deploy mechanisms should ignore it.

```bash
ACR=<your-acr-name> ./scripts/build-and-deploy.sh
```

It does `docker build --platform linux/amd64` → `az acr login` →
`docker push` → `kubectl set image` → `kubectl rollout status`. Override
with env vars if your naming differs:

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
`REPLACE_WITH_UAMI_CLIENT_ID` placeholder), the image handles it
gracefully: WorkloadIdentity is skipped automatically, `/readyz` stays
green, and Auto Discover surfaces a one-line "please enter endpoint
manually" instead of the raw AADSTS700016 dump.
