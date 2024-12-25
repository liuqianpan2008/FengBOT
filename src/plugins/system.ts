import { runcod, plugins, permission, PermissionLevel } from "../lib/decorators";
import { MessageContext } from "../lib/plugins";
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import 'reflect-metadata';

const execAsync = promisify(exec);

@plugins({
    id: "system",
    name: "系统监控",
    version: "1.0.0",
    describe: "监控服务器状态",
    author: "枫叶秋林",
    help: {
        enabled: true,
        description: "显示服务器状态信息"
    }
})
export class System {
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    @permission(PermissionLevel.ADMIN)
    @runcod(["status", "状态"], "查看服务器状态")
    async status(context: MessageContext): Promise<any> {
        // 获取CPU信息
        const cpuModel = os.cpus()[0].model;
        const cpuCount = os.cpus().length;
        const cpuUsage = process.cpuUsage();
        const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000).toFixed(2);

        // 获取内存信息
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercent = (usedMem / totalMem * 100).toFixed(2);

        // 计算运行时长
        const uptime = Date.now() - this.startTime;
        const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));

        return {
            title: "服务器状态",
            message: "当前服务器运行状态",
            info: {
                cpu: {
                    model: cpuModel,
                    cores: cpuCount,
                    usage: `${cpuPercent}%`
                },
                memory: {
                    total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
                    used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
                    percent: `${memPercent}%`
                },
                uptime: {
                    days,
                    hours,
                    minutes
                }
            },
            template: {
                enabled: true,
                sendText: false,
                path: path.resolve(__dirname, '..', 'resources', 'system', 'status.html'),
                render: {
                    type: 'png',
                    quality: 100,
                    fullPage: false,
                    background: true
                }
            },
            theme: {
                backgroundColor: '#ffffff',
                titleColor: '#1890ff',
                textColor: '#333333',
                labelColor: '#666666',
                valueColor: '#1890ff',
                borderColor: '#e8e8e8'
            },
            toString() {
                return [
                    "服务器状态:",
                    `CPU型号: ${cpuModel}`,
                    `CPU核心数: ${cpuCount}`,
                    `CPU使用率: ${cpuPercent}%`,
                    `内存总量: ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
                    `内存使用: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB (${memPercent}%)`,
                    `运行时长: ${days}天${hours}小时${minutes}分钟`
                ].join('\n');
            }
        };
    }

    @permission(PermissionLevel.ADMIN)
    @runcod(["top", "进程"], "查看进程占用")
    async top(context: MessageContext): Promise<any> {
        try {
            // 根据操作系统执行不同的命令
            const platform = os.platform();
            let cmd = '';
            
            if (platform === 'win32') {
                // Windows
                cmd = 'tasklist /FO CSV /NH';
            } else if (platform === 'darwin') {
                // macOS
                cmd = 'ps -arcwwwxo "pid command %cpu %mem" | head -11';
            } else {
                // Linux
                cmd = 'ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -11';
            }

            const { stdout } = await execAsync(cmd);
            const processes = this.parseProcessList(stdout, platform);

            // 检查进程列表是否为空
            if (!processes || processes.length === 0) {
                return "无法获取进程信息";
            }

            // 调试日志
            console.log('Processes:', JSON.stringify(processes, null, 2));

            // 修改数据结构
            const renderData = {
                title: "进程状态",
                message: "当前占用最高的进程",
                table: {
                    headers: ["PID", "进程名", "CPU%", "内存%"],
                    rows: processes.map(p => ({
                        pid: p.pid.toString(),
                        name: p.name,
                        cpu: p.cpu,
                        memory: p.memory
                    }))
                },
                template: {
                    enabled: true,
                    sendText: false,
                    path: path.resolve(__dirname, '..', 'resources', 'system', 'top.html'),
                    render: {
                        width: 800,
                        height: Math.min(600, 150 + processes.length * 50),
                        type: 'png',
                        quality: 100,
                        fullPage: false,
                        background: true,
                        waitUntil: 'networkidle0',
                        deviceScaleFactor: 2,
                        timeout: 30000
                    }
                },
                theme: {
                    backgroundColor: '#ffffff',
                    titleColor: '#1890ff',
                    textColor: '#333333',
                    labelColor: '#666666',
                    valueColor: '#1890ff',
                    borderColor: '#e8e8e8',
                    headerColor: '#f5f5f5'
                }
            };

            // 添加 toString 方法
            Object.defineProperty(renderData, 'toString', {
                value: function() {
                    const headers = ['PID', '进程名', 'CPU%', '内存%'].map(h => h.padEnd(15)).join('');
                    const lines = processes.map(p => 
                        `${p.pid.toString().padEnd(15)}${p.name.padEnd(15)}${p.cpu.padEnd(15)}${p.memory.padEnd(15)}`
                    );
                    return ['进程状态:', headers, ...lines].join('\n');
                },
                enumerable: false
            });

            return renderData;
        } catch (error) {
            console.error('Error:', error);
            return `获取进程信息失败: ${error instanceof Error ? error.message : '未知错误'}`;
        }
    }

    private parseProcessList(output: string, platform: string): Array<{pid: number, name: string, cpu: string, memory: string}> {
        if (platform === 'win32') {
            // Windows 输出解析
            return output.split('\n')
                .filter(line => line.trim())
                .slice(0, 10)
                .map(line => {
                    const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
                    return {
                        pid: parseInt(parts[1] || '0'),
                        name: parts[0] || 'unknown',
                        cpu: 'N/A',
                        memory: parts[4]?.replace(/[^\d.]/g, '') || '0'
                    };
                })
                .filter(p => p.pid > 0);
        } else if (platform === 'darwin') {
            // macOS 输出解析
            return output.split('\n')
                .filter(line => line.trim())
                .slice(1, 11) // 跳过标题行
                .map(line => {
                    // 使用正则表达式匹配进程信息
                    const match = line.match(/^\s*(\d+)\s+([^\s].+?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s*$/);
                    if (!match) return null;

                    const [, pid, name, cpu, memory] = match;
                    return {
                        pid: parseInt(pid),
                        name: name.trim().slice(0, 20), // 限制进程名长度
                        cpu: `${parseFloat(cpu).toFixed(1)}%`,
                        memory: `${parseFloat(memory).toFixed(1)}%`
                    };
                })
                .filter((p): p is NonNullable<typeof p> => p !== null)
                .slice(0, 10);
        } else {
            // Linux 输出解析
            return output.split('\n')
                .filter(line => line.trim())
                .slice(1, 11)
                .map(line => {
                    const parts = line.trim().split(/\s+/);
                    return {
                        pid: parseInt(parts[0] || '0'),
                        name: parts[1] || 'unknown',
                        cpu: `${parseFloat(parts[2] || '0').toFixed(1)}%`,
                        memory: `${parseFloat(parts[3] || '0').toFixed(1)}%`
                    };
                })
                .filter(p => p.pid > 0);
        }
    }
} 