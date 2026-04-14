#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AOAI 延迟数据可视化工具
读取CSV数据文件并生成趋势图
"""

import sys
import os
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime

def load_csv_data(csv_file):
    """加载CSV数据"""
    if not os.path.exists(csv_file):
        print(f"错误: 文件不存在 - {csv_file}")
        sys.exit(1)
    
    try:
        df = pd.read_csv(csv_file)
        # 转换时间戳
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        # 只保留成功的请求
        df_success = df[df['success'] == True].copy()
        return df, df_success
    except Exception as e:
        print(f"错误: 无法读取CSV文件 - {e}")
        sys.exit(1)


def generate_charts(csv_file):
    """生成延迟趋势图"""
    print(f"正在读取数据: {csv_file}")
    df_all, df = load_csv_data(csv_file)
    
    if len(df) == 0:
        print("错误: 没有成功的请求数据可供分析")
        sys.exit(1)
    
    print(f"成功加载 {len(df)} 条成功记录 (总共 {len(df_all)} 条)")
    
    # 设置中文字体
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS', 'DejaVu Sans']
    plt.rcParams['axes.unicode_minus'] = False
    
    # 创建图表
    fig, axes = plt.subplots(3, 2, figsize=(16, 12))
    fig.suptitle(f'AOAI 延迟监控趋势图\n{df["timestamp"].min().strftime("%Y-%m-%d %H:%M")} - {df["timestamp"].max().strftime("%H:%M")}', 
                 fontsize=16, fontweight='bold')
    
    # 1. DNS解析时间
    ax1 = axes[0, 0]
    ax1.plot(df['timestamp'], df['dns_ms'], 'b-', linewidth=1, alpha=0.7, label='DNS')
    ax1.fill_between(df['timestamp'], df['dns_ms'], alpha=0.3)
    ax1.set_title('DNS 解析时间', fontsize=12, fontweight='bold')
    ax1.set_ylabel('时间 (ms)')
    ax1.grid(True, alpha=0.3)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)
    
    # 2. TCP连接时间
    ax2 = axes[0, 1]
    ax2.plot(df['timestamp'], df['tcp_rtt_ms'], 'g-', linewidth=1, alpha=0.7, label='TCP RTT')
    ax2.fill_between(df['timestamp'], df['tcp_rtt_ms'], alpha=0.3, color='green')
    ax2.set_title('TCP 连接时间 (RTT)', fontsize=12, fontweight='bold')
    ax2.set_ylabel('时间 (ms)')
    ax2.grid(True, alpha=0.3)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45)
    
    # 3. SSL握手时间
    ax3 = axes[1, 0]
    ax3.plot(df['timestamp'], df['ssl_ms'], 'r-', linewidth=1, alpha=0.7, label='SSL')
    ax3.fill_between(df['timestamp'], df['ssl_ms'], alpha=0.3, color='red')
    ax3.set_title('SSL 握手时间', fontsize=12, fontweight='bold')
    ax3.set_ylabel('时间 (ms)')
    ax3.grid(True, alpha=0.3)
    ax3.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.setp(ax3.xaxis.get_majorticklabels(), rotation=45)
    
    # 4. TTFB时间
    ax4 = axes[1, 1]
    ax4.plot(df['timestamp'], df['ttfb_ms'], 'orange', linewidth=1, alpha=0.7, label='TTFB')
    ax4.fill_between(df['timestamp'], df['ttfb_ms'], alpha=0.3, color='orange')
    ax4.set_title('TTFB (Time To First Byte)', fontsize=12, fontweight='bold')
    ax4.set_ylabel('时间 (ms)')
    ax4.grid(True, alpha=0.3)
    ax4.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.setp(ax4.xaxis.get_majorticklabels(), rotation=45)
    
    # 5. 总耗时
    ax5 = axes[2, 0]
    ax5.plot(df['timestamp'], df['total_ms'], 'purple', linewidth=1, alpha=0.7, label='Total')
    ax5.fill_between(df['timestamp'], df['total_ms'], alpha=0.3, color='purple')
    ax5.set_title('总耗时 (Total Time)', fontsize=12, fontweight='bold')
    ax5.set_ylabel('时间 (ms)')
    ax5.set_xlabel('时间')
    ax5.grid(True, alpha=0.3)
    ax5.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.setp(ax5.xaxis.get_majorticklabels(), rotation=45)
    
    # 6. 统计信息
    ax6 = axes[2, 1]
    ax6.axis('off')
    
    stats_text = f"""统计信息 (基于 {len(df)} 个成功请求):

DNS 解析时间:
  平均: {df['dns_ms'].mean():.2f} ms
  最小: {df['dns_ms'].min():.2f} ms  最大: {df['dns_ms'].max():.2f} ms
  标准差: {df['dns_ms'].std():.2f} ms

TCP 连接时间:
  平均: {df['tcp_rtt_ms'].mean():.2f} ms
  最小: {df['tcp_rtt_ms'].min():.2f} ms  最大: {df['tcp_rtt_ms'].max():.2f} ms
  标准差: {df['tcp_rtt_ms'].std():.2f} ms

SSL 握手时间:
  平均: {df['ssl_ms'].mean():.2f} ms
  最小: {df['ssl_ms'].min():.2f} ms  最大: {df['ssl_ms'].max():.2f} ms
  标准差: {df['ssl_ms'].std():.2f} ms

TTFB:
  平均: {df['ttfb_ms'].mean():.2f} ms
  最小: {df['ttfb_ms'].min():.2f} ms  最大: {df['ttfb_ms'].max():.2f} ms
  标准差: {df['ttfb_ms'].std():.2f} ms

总耗时:
  平均: {df['total_ms'].mean():.2f} ms
  最小: {df['total_ms'].min():.2f} ms  最大: {df['total_ms'].max():.2f} ms
  标准差: {df['total_ms'].std():.2f} ms

失败请求: {len(df_all) - len(df)}  成功率: {len(df)/len(df_all)*100:.1f}%"""
    
    ax6.text(0.05, 0.95, stats_text, fontsize=9,
             verticalalignment='top', transform=ax6.transAxes)
    
    plt.tight_layout()
    
    # 保存图表
    output_dir = os.path.dirname(csv_file)
    base_name = os.path.basename(csv_file).replace('.csv', '')
    chart_filename = os.path.join(output_dir, f"{base_name}_chart.png")
    
    plt.savefig(chart_filename, dpi=150, bbox_inches='tight')
    print(f"\n✓ 图表已保存到: {chart_filename}")
    
    # 显示图表
    print("正在显示图表...")
    plt.show()
    
    # 生成统计报告
    report_filename = os.path.join(output_dir, f"{base_name}_report.txt")
    with open(report_filename, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("AOAI 延迟监控统计报告\n")
        f.write("=" * 70 + "\n")
        f.write(f"数据文件: {csv_file}\n")
        f.write(f"监控时间: {df['timestamp'].min()} - {df['timestamp'].max()}\n")
        f.write(f"监控时长: {(df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 60:.1f} 分钟\n")
        f.write(f"总请求数: {len(df_all)}\n")
        f.write(f"成功请求: {len(df)}\n")
        f.write(f"失败请求: {len(df_all) - len(df)}\n")
        f.write(f"成功率: {len(df)/len(df_all)*100:.1f}%\n")
        f.write("\n" + "-" * 70 + "\n")
        f.write("指标说明:\n")
        f.write("  DNS 解析时间  = time_namelookup\n")
        f.write("  TCP 连接时间  = time_connect - time_namelookup (≈1 RTT)\n")
        f.write("  SSL 握手时间  = time_appconnect - time_connect\n")
        f.write("    TLS 1.2 约 2 RTT, TLS 1.3 约 1 RTT, TLS 1.3+HRR 约 2 RTT\n")
        f.write("  TTFB          = time_starttransfer (累计)\n")
        f.write("    DNS + TCP + SSL + 发送请求 + 服务端处理 + 首字节返回\n")
        f.write("  总耗时(TTT)   = time_total (累计)\n")
        f.write("    TTFB + 下载剩余响应体的时间\n")
        f.write("-" * 70 + "\n")
        f.write("\n" + stats_text)
        f.write("\n" + "=" * 70 + "\n")
    
    print(f"✓ 统计报告已保存到: {report_filename}")


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python3 aoai-latency-visualizer.py <csv_file>")
        print("\n示例:")
        print("  python3 aoai-latency-visualizer.py aoai_latency_results/latency_data_20250202_143000.csv")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    generate_charts(csv_file)


if __name__ == "__main__":
    main()
