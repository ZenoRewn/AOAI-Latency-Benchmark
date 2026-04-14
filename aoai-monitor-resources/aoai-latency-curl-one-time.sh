#!/bin/bash

# AOAI 接口地址
URL="your Endpoint URL"
API_KEY="your API_KEY"
# 请求体
PAYLOAD='{"model": "your model name", "input": [{"role": "user", "content": "Hello"}]}'

# 获取当前发送时间戳
send_ts=$(date -u +"%Y-%m-%d %H:%M:%S.%3N")

# 临时文件存放响应头
HEADER_FILE=$(mktemp)

# 执行 curl 并获取各阶段耗时 + 保存响应头
read dns_time connect_time appconnect_time starttransfer_time total_time <<<$(curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "api-key: $API_KEY" \
  -d "$PAYLOAD" \
  -D "$HEADER_FILE" \
  -w "%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}" \
  -o /dev/null -s)

# 获取接收完成时间戳
recv_ts=$(date -u +"%Y-%m-%d %H:%M:%S.%3N")

# TCP网络连接耗时(不包括DNS)
network_time=$(awk "BEGIN {printf \"%.6f\", $connect_time - $dns_time}")

# 提取 apim-request-id 
header_request_id=$(grep -i "^apim-request-id:" "$HEADER_FILE" | awk '{print $2}' | tr -d '\r')

# 转换为毫秒
dns_ms=$(awk "BEGIN {printf \"%.3f\", $dns_time * 1000}")
connect_ms=$(awk "BEGIN {printf \"%.3f\", $connect_time * 1000}")
appconnect_ms=$(awk "BEGIN {printf \"%.3f\", $appconnect_time * 1000}")
starttransfer_ms=$(awk "BEGIN {printf \"%.3f\", $starttransfer_time * 1000}")
total_ms=$(awk "BEGIN {printf \"%.3f\", $total_time * 1000}")

network_ms=$(awk "BEGIN {printf \"%.3f\", ($total_time - $dns_time) * 1000}")
tcp_rtt_ms=$(awk "BEGIN {printf \"%.3f\", ($connect_time - $dns_time) * 1000}")
https_rtt_ms=$(awk "BEGIN {printf \"%.3f\", ($appconnect_time - $dns_time) / 2 * 1000}")


echo "===== AOAI 请求耗时统计 ====="
echo "发送时间戳 UTC: $send_ts"
echo "接收时间戳 UTC: $recv_ts"
echo "Request ID: ${header_request_id:-未返回apim-request-id}"
echo ""
echo "DNS解析时间: ${dns_ms}ms"
echo "TCP连接时间(含DNS): ${connect_ms}ms"
echo "TCP网络连接耗时(不包括DNS): ${tcp_rtt_ms}ms"
echo "SSL握手完成时间: ${appconnect_ms}ms"
echo ""
echo ""
echo "TTFB (Time To First Byte): ${starttransfer_time}s"
echo "  英文全称：Time To First Byte"
echo "  定义：从客户端发出请求开始，到收到服务器返回的第一个字节的时间。"
echo "  包含阶段：DNS解析 -> TCP连接建立 -> SSL/TLS握手(HTTPS) -> 客户端发送HTTP请求 -> 服务端处理并返回首字节"
echo "  本质：衡量网络传输 + 服务端处理延迟的重要指标。"
echo "  在 curl 中对应 %{time_starttransfer}"
echo ""
echo ""
echo "总耗时 (Total Transaction Time): ${total_time}s"
echo "  英文全称：Total Transaction Time"
echo "  定义：从客户端发出请求开始，到收到响应全部数据的时间。"
echo "  包含阶段：TTFB 所有阶段 + 接收剩余响应数据的时间（下载时间）"
echo "  在 curl 中对应 %{time_total}"
echo ""


# 删除临时文件
rm "$HEADER_FILE"
