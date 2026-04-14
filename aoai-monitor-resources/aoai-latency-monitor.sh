#!/bin/bash

# AOAI 延迟监控脚本 (Bash版本)
# 可配置执行间隔和持续时长,收集延迟数据并生成CSV报告

# 显示帮助信息
show_help() {
    cat << EOF
用法: $0 [选项]

AOAI 延迟监控脚本 - 定期监控 Azure OpenAI 服务延迟

选项:
  -i SECONDS    执行间隔(秒), 默认: 5秒
  -d SECONDS    持续时长(秒), 默认: 600秒 (10分钟)
  -o DIR        输出目录, 默认: aoai_latency_results
  -h            显示此帮助信息

示例:
  # 默认设置: 每5秒一次, 持续10分钟
  $0

  # 每10秒一次, 持续1小时
  $0 -i 10 -d 3600

  # 每2秒一次, 持续5分钟
  $0 -i 2 -d 300
  
  # 每5秒一次, 持续30秒(快速测试), 输出到自定义目录
  $0 -i 5 -d 30 -o my_results

EOF
    exit 0
}

# 配置
URL="your endpoint URL"
API_KEY="your api-key"
PAYLOAD='{"model": "your model name", "input": [{"role": "user", "content": "Hello"}]}'

# 默认参数
INTERVAL=5        # 每5秒执行一次
DURATION=600      # 持续600秒(10分钟)
OUTPUT_DIR="aoai_latency_results"

# 解析命令行参数
while getopts "i:d:o:h" opt; do
    case $opt in
        i)
            INTERVAL=$OPTARG
            ;;
        d)
            DURATION=$OPTARG
            ;;
        o)
            OUTPUT_DIR=$OPTARG
            ;;
        h)
            show_help
            ;;
        \?)
            echo "错误: 无效选项 -$OPTARG" >&2
            echo "使用 -h 查看帮助信息"
            exit 1
            ;;
    esac
done

# 参数验证
if [ "$INTERVAL" -le 0 ]; then
    echo "错误: 间隔时间必须大于0秒"
    exit 1
fi

if [ "$DURATION" -le 0 ]; then
    echo "错误: 持续时长必须大于0秒"
    exit 1
fi

if [ "$INTERVAL" -gt "$DURATION" ]; then
    echo "错误: 间隔时间不能大于持续时长"
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CSV_FILE="${OUTPUT_DIR}/latency_data_${TIMESTAMP}.csv"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 创建CSV文件并写入表头
echo "timestamp,request_id,dns_ms,tcp_rtt_ms,ssl_ms,ttfb_ms,total_ms,success,error" > "$CSV_FILE"

echo "======================================================================"
echo "                    AOAI 延迟监控脚本"
echo "======================================================================"
echo ""
echo "时间线示意:"
echo "  |-- DNS --|-- TCP(≈1 RTT) --|-- SSL(1~2 RTT) --|-- 发送请求+服务端处理 --|-- 下载响应 --|"
echo "  0     namelookup          connect          appconnect             starttransfer      total"
echo ""
echo "各指标说明:"
echo "  DNS 解析时间  = time_namelookup"
echo "    从请求开始到 DNS 解析完成的时间。"
echo "  TCP 连接时间  = time_connect - time_namelookup"
echo "    TCP 三次握手时间，客户端在收到 SYN-ACK 后即认为连接建立，约等于 1 个 RTT。"
echo "  SSL 握手时间  = time_appconnect - time_connect"
echo "    完整的 TLS 握手时间。TLS 1.2 约 2 个 RTT，TLS 1.3 约 1 个 RTT，TLS 1.3+HRR 约 2 个 RTT。"
echo "  TTFB          = time_starttransfer (累计时间)"
echo "    从请求开始到收到第一个响应字节，包含 DNS + TCP + SSL + 发送请求 + 服务端处理 + 首字节返回。"
echo "  总耗时(TTT)   = time_total (累计时间)"
echo "    从请求开始到接收完所有响应数据，包含 TTFB + 下载剩余响应体的时间。"
echo "======================================================================"
echo "监控间隔: ${INTERVAL} 秒"
echo "监控时长: ${DURATION} 秒 ($((DURATION / 60)) 分钟)"
echo "预计请求次数: ~$((DURATION / INTERVAL)) 次 (实际取决于每次请求耗时)"
echo "输出文件: ${CSV_FILE}"
echo "======================================================================"
echo ""

# 统计变量
total_requests=0
successful_requests=0
failed_requests=0

# 累计值(用于计算平均值)
sum_dns=0
sum_tcp=0
sum_ssl=0
sum_ttfb=0
sum_total=0

# 最小值和最大值
min_ttfb=999999
max_ttfb=0
min_total=999999
max_total=0

start_time=$(date +%s)

# 主循环
while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    # 检查是否超时
    if [ $elapsed -ge $DURATION ]; then
        break
    fi
    
    total_requests=$((total_requests + 1))
    remaining=$((DURATION - elapsed))
    
    echo ""
    echo "[$total_requests] 执行请求... (已运行: $((elapsed / 60))分钟, 剩余: $((remaining / 60))分钟)"
    
    # 获取当前时间戳
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")
    
    # 临时文件存放响应头
    HEADER_FILE=$(mktemp)
    
    # 执行 curl 并获取各阶段耗时
    read dns_time connect_time appconnect_time starttransfer_time total_time <<<$(curl -X POST "$URL" \
      -H "Content-Type: application/json" \
      -H "api-key: $API_KEY" \
      -d "$PAYLOAD" \
      -D "$HEADER_FILE" \
      -w "%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}" \
      -o /dev/null -s 2>&1)
    
    # 检查curl是否成功
    if [ $? -eq 0 ] && [ -n "$total_time" ] && [ "$total_time" != "0.000000" ]; then
        # 提取 apim-request-id
        request_id=$(grep -i "^apim-request-id:" "$HEADER_FILE" | awk '{print $2}' | tr -d '\r' | tr -d '\n')
        
        # 转换为毫秒
        dns_ms=$(awk "BEGIN {printf \"%.3f\", $dns_time * 1000}")
        tcp_rtt_ms=$(awk "BEGIN {printf \"%.3f\", ($connect_time - $dns_time) * 1000}")
        ssl_ms=$(awk "BEGIN {printf \"%.3f\", ($appconnect_time - $connect_time) * 1000}")
        ttfb_ms=$(awk "BEGIN {printf \"%.3f\", $starttransfer_time * 1000}")
        total_ms=$(awk "BEGIN {printf \"%.3f\", $total_time * 1000}")
        
        # 写入CSV
        echo "${timestamp},${request_id},${dns_ms},${tcp_rtt_ms},${ssl_ms},${ttfb_ms},${total_ms},true," >> "$CSV_FILE"
        
        # 更新统计
        successful_requests=$((successful_requests + 1))
        sum_dns=$(awk "BEGIN {printf \"%.3f\", $sum_dns + $dns_ms}")
        sum_tcp=$(awk "BEGIN {printf \"%.3f\", $sum_tcp + $tcp_rtt_ms}")
        sum_ssl=$(awk "BEGIN {printf \"%.3f\", $sum_ssl + $ssl_ms}")
        sum_ttfb=$(awk "BEGIN {printf \"%.3f\", $sum_ttfb + $ttfb_ms}")
        sum_total=$(awk "BEGIN {printf \"%.3f\", $sum_total + $total_ms}")
        
        # 更新最小/最大值
        min_ttfb=$(awk "BEGIN {if ($ttfb_ms < $min_ttfb) print $ttfb_ms; else print $min_ttfb}")
        max_ttfb=$(awk "BEGIN {if ($ttfb_ms > $max_ttfb) print $ttfb_ms; else print $max_ttfb}")
        min_total=$(awk "BEGIN {if ($total_ms < $min_total) print $total_ms; else print $min_total}")
        max_total=$(awk "BEGIN {if ($total_ms > $max_total) print $total_ms; else print $max_total}")
        
        echo "  ✓ 成功 - TTFB: ${ttfb_ms}ms, 总耗时: ${total_ms}ms"
        echo "    DNS: ${dns_ms}ms, TCP: ${tcp_rtt_ms}ms, SSL: ${ssl_ms}ms"
        echo "    Request ID: ${request_id}"
    else
        failed_requests=$((failed_requests + 1))
        error_msg="Request failed or timeout"
        echo "${timestamp},,,,,,,false,${error_msg}" >> "$CSV_FILE"
        echo "  ✗ 失败 - ${error_msg}"
    fi
    
    # 删除临时文件
    rm -f "$HEADER_FILE"
    
    # 等待下一次执行
    sleep $INTERVAL
done

echo ""
echo "======================================================================"
echo "                         监控完成!"
echo "======================================================================"
echo "总请求数: $total_requests"
echo "成功请求: $successful_requests"
echo "失败请求: $failed_requests"

if [ $successful_requests -gt 0 ]; then
    avg_dns=$(awk "BEGIN {printf \"%.2f\", $sum_dns / $successful_requests}")
    avg_tcp=$(awk "BEGIN {printf \"%.2f\", $sum_tcp / $successful_requests}")
    avg_ssl=$(awk "BEGIN {printf \"%.2f\", $sum_ssl / $successful_requests}")
    avg_ttfb=$(awk "BEGIN {printf \"%.2f\", $sum_ttfb / $successful_requests}")
    avg_total=$(awk "BEGIN {printf \"%.2f\", $sum_total / $successful_requests}")
    success_rate=$(awk "BEGIN {printf \"%.1f\", $successful_requests * 100.0 / $total_requests}")
    
    echo ""
    echo "统计数据 (基于 ${successful_requests} 个成功请求):"
    echo "-------------------------------------------------------------------"
    echo "DNS 解析时间    - 平均: ${avg_dns}ms"
    echo "TCP 连接时间    - 平均: ${avg_tcp}ms"
    echo "SSL 握手时间    - 平均: ${avg_ssl}ms"
    echo "TTFB           - 平均: ${avg_ttfb}ms, 最小: ${min_ttfb}ms, 最大: ${max_ttfb}ms"
    echo "总耗时         - 平均: ${avg_total}ms, 最小: ${min_total}ms, 最大: ${max_total}ms"
    echo "成功率: ${success_rate}%"
fi

echo ""
echo "数据已保存到: ${CSV_FILE}"
echo ""
echo "使用 Python 脚本生成图表:"
echo "  python3 aoai-latency-visualizer.py ${CSV_FILE}"
echo "======================================================================"
