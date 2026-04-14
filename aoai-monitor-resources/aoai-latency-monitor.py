#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AOAI 延迟监控脚本
可配置执行间隔和持续时长，收集延迟数据并生成趋势图
"""

import subprocess
import time
import json
import re
import sys
import argparse
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from collections import defaultdict
import os

# 配置
URL = "Your Endpoint URL"
API_KEY = "Your API_KEY"
PAYLOAD = '{"model": "your model name", "input": [{"role": "user", "content": "Hello"}]}'

# 默认值（可通过命令行参数覆盖）
DEFAULT_INTERVAL = 5  # 默认每5秒执行一次
DEFAULT_DURATION = 10 * 60  # 默认持续10分钟
OUTPUT_DIR = "aoai_latency_results"

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 数据存储
data_points = []


def execute_curl_request():
    """执行curl请求并返回各项延迟指标"""
    try:
        # 构建curl命令
        cmd = [
            'curl', '-X', 'POST', URL,
            '-H', 'Content-Type: application/json',
            '-H', f'api-key: {API_KEY}',
            '-d', PAYLOAD,
            '-w', '%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}',
            '-o', '/dev/null',
            '-s',
            '-D', '-'  # 输出响应头到stdout
        ]
        
        start_time = datetime.now()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        end_time = datetime.now()
        
        # 解析curl输出
        output = result.stdout
        
        # 提取timing信息(在最后一行)
        lines = output.strip().split('\n')
        timing_line = lines[-1] if lines else ""
        
        # 提取apim-request-id
        request_id = ""
        for line in lines:
            if line.lower().startswith('apim-request-id:'):
                request_id = line.split(':', 1)[1].strip()
                break
        
        # 解析timing数据
        timings = timing_line.split('|')
        if len(timings) == 5:
            dns_time = float(timings[0])
            connect_time = float(timings[1])
            appconnect_time = float(timings[2])
            starttransfer_time = float(timings[3])
            total_time = float(timings[4])
            
            # 计算各项指标(单位:毫秒)
            dns_ms = dns_time * 1000
            tcp_rtt_ms = (connect_time - dns_time) * 1000
            ssl_ms = (appconnect_time - connect_time) * 1000
            ttfb_ms = starttransfer_time * 1000
            total_ms = total_time * 1000
            
            return {
                'timestamp': start_time,
                'request_id': request_id,
                'dns_ms': dns_ms,
                'tcp_rtt_ms': tcp_rtt_ms,
                'ssl_ms': ssl_ms,
                'ttfb_ms': ttfb_ms,
                'total_ms': total_ms,
                'success': True
            }
        else:
            return {
                'timestamp': start_time,
                'success': False,
                'error': 'Failed to parse timing data'
            }
            
    except subprocess.TimeoutExpired:
        return {
            'timestamp': datetime.now(),
            'success': False,
            'error': 'Request timeout'
        }
    except Exception as e:
        return {
            'timestamp': datetime.now(),
            'success': False,
            'error': str(e)
        }


def save_data_to_json(output_dir=OUTPUT_DIR):
    """保存数据到JSON文件"""
    filename = os.path.join(output_dir, f"latency_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data_points, f, indent=2, default=str)
    print(f"\n数据已保存到: {filename}")
    return filename


def generate_charts(output_dir=OUTPUT_DIR):
    """生成延迟趋势图"""
    if not data_points:
        print("没有数据可供生成图表")
        return
    
    # 过滤成功的数据点
    successful_points = [p for p in data_points if p.get('success', False)]
    
    if not successful_points:
        print("没有成功的请求数据")
        return
    
    # 提取数据
    timestamps = [p['timestamp'] for p in successful_points]
    dns_values = [p['dns_ms'] for p in successful_points]
    tcp_values = [p['tcp_rtt_ms'] for p in successful_points]
    ssl_values = [p['ssl_ms'] for p in successful_points]
    ttfb_values = [p['ttfb_ms'] for p in successful_points]
    total_values = [p['total_ms'] for p in successful_points]
    
    # 设置中文字体
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
    plt.rcParams['axes.unicode_minus'] = False
    
    # 创建图表
    fig, axes = plt.subplots(3, 2, figsize=(16, 12))
    fig.suptitle('AOAI 延迟监控趋势图', fontsize=16, fontweight='bold')
    
    # 1. DNS解析时间
    ax1 = axes[0, 0]
    ax1.plot(timestamps, dns_values, 'b-', linewidth=1, alpha=0.7)
    ax1.fill_between(timestamps, dns_values, alpha=0.3)
    ax1.set_title('DNS 解析时间')
    ax1.set_ylabel('时间 (ms)')
    ax1.grid(True, alpha=0.3)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    
    # 2. TCP连接时间
    ax2 = axes[0, 1]
    ax2.plot(timestamps, tcp_values, 'g-', linewidth=1, alpha=0.7)
    ax2.fill_between(timestamps, tcp_values, alpha=0.3, color='green')
    ax2.set_title('TCP 连接时间 (RTT)')
    ax2.set_ylabel('时间 (ms)')
    ax2.grid(True, alpha=0.3)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    
    # 3. SSL握手时间
    ax3 = axes[1, 0]
    ax3.plot(timestamps, ssl_values, 'r-', linewidth=1, alpha=0.7)
    ax3.fill_between(timestamps, ssl_values, alpha=0.3, color='red')
    ax3.set_title('SSL 握手时间')
    ax3.set_ylabel('时间 (ms)')
    ax3.grid(True, alpha=0.3)
    ax3.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    
    # 4. TTFB时间
    ax4 = axes[1, 1]
    ax4.plot(timestamps, ttfb_values, 'orange', linewidth=1, alpha=0.7)
    ax4.fill_between(timestamps, ttfb_values, alpha=0.3, color='orange')
    ax4.set_title('TTFB (Time To First Byte)')
    ax4.set_ylabel('时间 (ms)')
    ax4.grid(True, alpha=0.3)
    ax4.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    
    # 5. 总耗时
    ax5 = axes[2, 0]
    ax5.plot(timestamps, total_values, 'purple', linewidth=1, alpha=0.7)
    ax5.fill_between(timestamps, total_values, alpha=0.3, color='purple')
    ax5.set_title('总耗时 (Total Time)')
    ax5.set_ylabel('时间 (ms)')
    ax5.set_xlabel('时间')
    ax5.grid(True, alpha=0.3)
    ax5.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    
    # 6. 统计信息
    ax6 = axes[2, 1]
    ax6.axis('off')
    
    stats_text = f"""统计信息 (基于 {len(successful_points)} 个成功请求):

DNS 解析时间:
  平均: {sum(dns_values)/len(dns_values):.2f} ms
  最小: {min(dns_values):.2f} ms  最大: {max(dns_values):.2f} ms

TCP 连接时间:
  平均: {sum(tcp_values)/len(tcp_values):.2f} ms
  最小: {min(tcp_values):.2f} ms  最大: {max(tcp_values):.2f} ms

SSL 握手时间:
  平均: {sum(ssl_values)/len(ssl_values):.2f} ms
  最小: {min(ssl_values):.2f} ms  最大: {max(ssl_values):.2f} ms

TTFB:
  平均: {sum(ttfb_values)/len(ttfb_values):.2f} ms
  最小: {min(ttfb_values):.2f} ms  最大: {max(ttfb_values):.2f} ms

总耗时:
  平均: {sum(total_values)/len(total_values):.2f} ms
  最小: {min(total_values):.2f} ms  最大: {max(total_values):.2f} ms

失败请求: {len(data_points) - len(successful_points)}  成功率: {len(successful_points)/len(data_points)*100:.1f}%"""
    
    ax6.text(0.05, 0.95, stats_text, fontsize=9,
             verticalalignment='top', transform=ax6.transAxes)
    
    plt.tight_layout()
    
    # 保存图表
    chart_filename = os.path.join(output_dir, f"latency_chart_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
    plt.savefig(chart_filename, dpi=150, bbox_inches='tight')
    print(f"图表已保存到: {chart_filename}")
    
    # 显示图表
    plt.show()


def main():
    """主函数"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(
        description='AOAI 延迟监控脚本 - 定期监控 Azure OpenAI 服务延迟',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 默认设置: 每5秒一次, 持续30分钟
  python %(prog)s
  
  # 每10秒一次, 持续1小时
  python %(prog)s -i 10 -d 3600
  
  # 每2秒一次, 持续5分钟
  python %(prog)s --interval 2 --duration 300
  
  # 每5秒一次, 持续30秒(快速测试)
  python %(prog)s -i 5 -d 30
        """
    )
    
    parser.add_argument(
        '-i', '--interval',
        type=int,
        default=DEFAULT_INTERVAL,
        metavar='SECONDS',
        help=f'执行间隔(秒), 默认: {DEFAULT_INTERVAL}秒'
    )
    
    parser.add_argument(
        '-d', '--duration',
        type=int,
        default=DEFAULT_DURATION,
        metavar='SECONDS',
        help=f'持续时长(秒), 默认: {DEFAULT_DURATION}秒 ({DEFAULT_DURATION//60}分钟)'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default=OUTPUT_DIR,
        metavar='DIR',
        help=f'输出目录, 默认: {OUTPUT_DIR}'
    )
    
    args = parser.parse_args()
    
    # 设置参数
    interval = args.interval
    duration = args.duration  # 已经是秒
    output_dir = args.output
    
    # 参数验证
    if interval <= 0:
        print("错误: 间隔时间必须大于0秒")
        sys.exit(1)
    
    if duration <= 0:
        print("错误: 持续时长必须大于0秒")
        sys.exit(1)
    
    if interval > duration:
        print("错误: 间隔时间不能大于持续时长")
        sys.exit(1)
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    print("=" * 60)
    print("AOAI 延迟监控脚本")
    print("=" * 60)
    print()
    print("时间线示意:")
    print("  |-- DNS --|-- TCP(≈1 RTT) --|-- SSL(1~2 RTT) --|-- 发送请求+服务端处理 --|-- 下载响应 --|")
    print("  0     namelookup          connect          appconnect             starttransfer      total")
    print()
    print("各指标说明:")
    print("  DNS 解析时间  = time_namelookup")
    print("    从请求开始到 DNS 解析完成的时间。")
    print("  TCP 连接时间  = time_connect - time_namelookup")
    print("    TCP 三次握手时间，客户端在收到 SYN-ACK 后即认为连接建立，约等于 1 个 RTT。")
    print("  SSL 握手时间  = time_appconnect - time_connect")
    print("    完整的 TLS 握手时间。TLS 1.2 约 2 个 RTT，TLS 1.3 约 1 个 RTT，TLS 1.3+HRR 约 2 个 RTT。")
    print("  TTFB          = time_starttransfer (累计时间)")
    print("    从请求开始到收到第一个响应字节，包含 DNS + TCP + SSL + 发送请求 + 服务端处理 + 首字节返回。")
    print("  总耗时(TTT)   = time_total (累计时间)")
    print("    从请求开始到接收完所有响应数据，包含 TTFB + 下载剩余响应体的时间。")
    print("=" * 60)
    print(f"监控间隔: {interval} 秒")
    print(f"监控时长: {duration} 秒")
    print(f"预计请求次数: ~{duration//interval} 次 (实际取决于每次请求耗时)")
    print(f"输出目录: {output_dir}")
    print("=" * 60)
    print()
    
    start_time = time.time()
    request_count = 0
    
    try:
        while (time.time() - start_time) < duration:
            request_count += 1
            elapsed = time.time() - start_time
            remaining = duration - elapsed
            
            print(f"\n[{request_count}] 执行请求... (已运行: {elapsed:.1f}秒, 剩余: {remaining:.1f}秒)")
            
            # 执行请求
            result = execute_curl_request()
            data_points.append(result)
            
            # 打印结果
            if result.get('success'):
                print(f"  ✓ 成功 - TTFB: {result['ttfb_ms']:.2f}ms, 总耗时: {result['total_ms']:.2f}ms")
                print(f"    DNS: {result['dns_ms']:.2f}ms, TCP: {result['tcp_rtt_ms']:.2f}ms, SSL: {result['ssl_ms']:.2f}ms")
                print(f"    Request ID: {result.get('request_id', 'N/A')}")
            else:
                print(f"  ✗ 失败 - {result.get('error', 'Unknown error')}")
            
            # 等待下一次执行
            if (time.time() - start_time) < duration:
                time.sleep(interval)
        
        print("\n" + "=" * 60)
        print("监控完成!")
        print("=" * 60)
        
        # 保存数据
        save_data_to_json(output_dir)
        
        # 生成图表
        print("\n正在生成趋势图...")
        generate_charts(output_dir)
        
    except KeyboardInterrupt:
        print("\n\n监控被用户中断")
        print("正在保存已收集的数据...")
        save_data_to_json(output_dir)
        
        if len(data_points) > 0:
            print("正在生成趋势图...")
            generate_charts(output_dir)


if __name__ == "__main__":
    main()
