# AOAI 延迟监控工具

这套工具用于监控 Azure OpenAI (AOAI) 服务的延迟情况,默认每5秒执行一次请求,持续10分钟,并生成详细的趋势图和统计报告。
填入相应的Endpoint URL，API Key 和 model name

## 文件说明

### 1. `aoai-latency-monitor.py` (推荐)
Python 版本的监控脚本,功能完整,自动生成图表。

**特点:**
- ✅ 自动执行监控(默认每5秒一次,持续10分钟)
- ✅ 实时显示进度和结果(含 Request ID)
- ✅ 自动保存JSON数据
- ✅ 自动生成趋势图
- ✅ 支持 Ctrl+C 中断后仍保存数据和生成图表
- ✅ 启动时显示各延迟指标详细说明

### 2. `aoai-latency-monitor.sh`
Bash 版本的监控脚本,生成CSV数据文件。

**特点:**
- ✅ 纯 Bash 实现,无需 Python 环境
- ✅ 生成 CSV 格式数据
- ✅ 实时统计信息(含 Request ID)
- ✅ 需配合可视化工具使用

### 3. `aoai-latency-visualizer.py`
数据可视化工具,从 CSV 文件生成图表。

**特点:**
- ✅ 读取 CSV 数据
- ✅ 生成多维度趋势图
- ✅ 生成统计报告
- ✅ 可重复使用,分析历史数据

### 4. `aoai-latency-curl.sh`
原始的单次执行脚本,用于快速测试。

## 依赖安装

### Python 依赖
```bash
# 安装必要的 Python 包
pip install matplotlib pandas

# 或使用国内镜像加速
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple matplotlib pandas
```

### Bash 依赖
- curl
- awk
- grep
- 标准 Unix 工具

## 使用方法

### 方法 1: 使用 Python 脚本 (推荐)

```bash
# 直接运行,自动监控 10 分钟并生成图表
python3 aoai-latency-monitor.py
```

**运行过程:**
1. 每 5 秒执行一次 AOAI 请求
2. 实时显示延迟数据(含 Request ID)
3. 运行 10 分钟后自动停止
4. 保存数据到 `aoai_latency_results/latency_data_YYYYMMDD_HHMMSS.json`
5. 自动生成并显示趋势图

**中断处理:**
- 按 `Ctrl+C` 可提前结束
- 已收集的数据会自动保存
- 仍会生成图表(基于已收集的数据)

### 方法 2: 使用 Bash 脚本

```bash
# 1. 运行监控脚本
bash aoai-latency-monitor.sh

# 2. 等待 10 分钟后,使用可视化工具生成图表
python3 aoai-latency-visualizer.py aoai_latency_results/latency_data_20250202_143000.csv
```

### 方法 3: 分析历史数据

如果已经有 CSV 数据文件,可以重新生成图表:

```bash
python3 aoai-latency-visualizer.py <path_to_csv_file>
```

## 输出文件

所有输出文件保存在 `aoai_latency_results/` 目录下:

### Python 版本输出:
- `latency_data_YYYYMMDD_HHMMSS.json` - JSON 格式的原始数据
- `latency_chart_YYYYMMDD_HHMMSS.png` - 趋势图 (PNG格式)

### Bash 版本输出:
- `latency_data_YYYYMMDD_HHMMSS.csv` - CSV 格式的数据
- `latency_data_YYYYMMDD_HHMMSS_chart.png` - 趋势图 (使用可视化工具生成)
- `latency_data_YYYYMMDD_HHMMSS_report.txt` - 文本格式的统计报告

## 监控指标说明

### 时间线示意

```
|-- DNS --|-- TCP(≈1 RTT) --|-- SSL(1~2 RTT) --|-- 发送请求+服务端处理 --|-- 下载响应 --|
0     namelookup          connect          appconnect             starttransfer      total
```

### 1. DNS 解析时间 (`time_namelookup`)
- 从请求开始到 DNS 解析完成的时间
- 正常范围: 通常 < 50ms

### 2. TCP 连接时间 (`time_connect - time_namelookup`)
- TCP 三次握手时间,客户端在收到 SYN-ACK 后即认为连接建立,约等于 **1 个 RTT**
- 反映客户端到服务器的网络往返延迟

### 3. SSL 握手时间 (`time_appconnect - time_connect`)
- 完整的 TLS 握手时间,包含证书验证等操作
- TLS 1.2 约 **2 个 RTT**,TLS 1.3 约 **1 个 RTT**,TLS 1.3+HRR 约 **2 个 RTT**
- 如果出现 HelloRetryRequest (HRR),会额外增加一个往返

### 4. TTFB - Time To First Byte (`time_starttransfer`,累计时间)
- 从请求开始到收到第一个响应字节的时间
- 包含: DNS + TCP + SSL + 发送请求 + 服务端处理 + 首字节返回
- **最重要的指标之一**,衡量网络传输 + 服务端处理延迟

### 5. 总耗时 TTT - Total Transaction Time (`time_total`,累计时间)
- 从请求开始到接收完所有响应数据的时间
- 包含: TTFB + 下载剩余响应体的时间

## 趋势图说明

生成的趋势图包含 6 个子图:

1. **左上**: DNS 解析时间趋势
2. **右上**: TCP 连接时间趋势
3. **左中**: SSL 握手时间趋势
4. **右中**: TTFB 时间趋势
5. **左下**: 总耗时趋势
6. **右下**: 统计信息汇总

每个趋势图显示:
- 时间序列曲线
- 填充区域(方便观察波动)
- 网格线(便于读数)
- X 轴为时间 (HH:MM 格式)
- Y 轴为延迟时间 (毫秒)

统计信息包括:
- 平均值 (Mean)
- 最小值 (Min)
- 最大值 (Max)
- 标准差 (Std Dev) - 仅 Python 版本
- 成功率
- 失败请求数

## 自定义配置

### 修改监控参数

编辑脚本中的以下变量:

```python
# Python 版本 (aoai-latency-monitor.py)
DEFAULT_INTERVAL = 5          # 执行间隔(秒)
DEFAULT_DURATION = 10 * 60    # 持续时长(秒), 10*60 = 10分钟
```

```bash
# Bash 版本 (aoai-latency-monitor.sh)
INTERVAL=5            # 执行间隔(秒)
DURATION=600          # 持续时长(秒), 10分钟
```

### 修改 AOAI 配置

编辑脚本中的以下变量:

```bash
URL="your_aoai_endpoint"
API_KEY="your_api_key"
PAYLOAD='{"model": "your_model", "input": [{"role": "user", "content": "Hello"}]}'
```

## 常见问题

### 1. 图表中文显示乱码
**解决方案**: 确保系统安装了中文字体
```bash
# Ubuntu/Debian
sudo apt-get install fonts-wqy-zenhei

# macOS (通常已包含)
# Windows (通常已包含)
```

### 2. 无法执行 Bash 脚本
```bash
# 添加执行权限
chmod +x aoai-latency-monitor.sh
chmod +x aoai-latency-curl.sh
```

### 3. Python 包安装失败
```bash
# 使用国内镜像
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple matplotlib pandas

# 或升级 pip
pip install --upgrade pip
```

### 4. curl 命令不存在
```bash
# Ubuntu/Debian
sudo apt-get install curl

# macOS
brew install curl

# Windows
# 使用 Git Bash 或 WSL
```

## 示例输出

### 终端输出示例:
```
============================================================
AOAI 延迟监控脚本
============================================================

时间线示意:
  |-- DNS --|-- TCP(≈1 RTT) --|-- SSL(1~2 RTT) --|-- 发送请求+服务端处理 --|-- 下载响应 --|
  0     namelookup          connect          appconnect             starttransfer      total

各指标说明:
  DNS 解析时间  = time_namelookup
    从请求开始到 DNS 解析完成的时间。
  TCP 连接时间  = time_connect - time_namelookup
    TCP 三次握手时间，客户端在收到 SYN-ACK 后即认为连接建立，约等于 1 个 RTT。
  SSL 握手时间  = time_appconnect - time_connect
    完整的 TLS 握手时间。TLS 1.2 约 2 个 RTT，TLS 1.3 约 1 个 RTT，TLS 1.3+HRR 约 2 个 RTT。
  TTFB          = time_starttransfer (累计时间)
    从请求开始到收到第一个响应字节，包含 DNS + TCP + SSL + 发送请求 + 服务端处理 + 首字节返回。
  总耗时(TTT)   = time_total (累计时间)
    从请求开始到接收完所有响应数据，包含 TTFB + 下载剩余响应体的时间。
============================================================
监控间隔: 5 秒
监控时长: 600 秒
预计请求次数: ~120 次 (实际取决于每次请求耗时)
输出目录: aoai_latency_results
============================================================

[1] 执行请求... (已运行: 0.0秒, 剩余: 600.0秒)
  ✓ 成功 - TTFB: 2050.06ms, 总耗时: 2050.20ms
    DNS: 104.93ms, TCP: 228.86ms, SSL: 446.89ms
    Request ID: dc6e0a6e-535e-4947-ac53-4e9f1e8e8dcc

[2] 执行请求... (已运行: 7.0秒, 剩余: 593.0秒)
  ✓ 成功 - TTFB: 2515.81ms, 总耗时: 2515.97ms
    DNS: 51.84ms, TCP: 219.43ms, SSL: 444.38ms
    Request ID: 24f94f44-cdf3-4180-9905-0f165b10a8c1
...
```

### 统计报告示例:
```
统计信息 (基于 360 个成功请求):

DNS 解析时间:
  平均: 14.56 ms
  最小: 10.23 ms
  最大: 25.67 ms
  标准差: 3.45 ms

TTFB:
  平均: 122.34 ms
  最小: 110.45 ms
  最大: 150.67 ms
  标准差: 8.92 ms

总耗时:
  平均: 132.45 ms
  最小: 120.23 ms
  最大: 160.89 ms
  标准差: 9.67 ms

成功率: 100.0%
```

## 注意事项

1. **监控时长**: 默认10分钟监控会产生约 120 次请求(实际取决于每次请求耗时),请确保 API 配额充足
2. **网络稳定性**: 建议在稳定的网络环境下运行
3. **中断恢复**: Python 版本支持 Ctrl+C 中断后保存数据,Bash 版本不支持
4. **时区**: 所有时间戳使用 UTC 时间
5. **磁盘空间**: 确保有足够空间保存数据和图表

## 技术支持

如有问题或建议,请联系开发团队。

---
最后更新: 2026-03-10
