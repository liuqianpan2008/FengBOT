import { runcod, plugins, param, ParamType, permission, PermissionLevel, Command } from "../lib/decorators";
import { PluginManager } from "../lib/plugin-manager";
import { MessageContext } from "../lib/plugins";
import path from 'path';
import 'reflect-metadata';
import botlogger from "../lib/logger";

interface PluginResponse {
    title: string;
    message: string;
    plugins?: Array<{
        id: string;
        name: string;
        status: string;
        version?: string;
        author?: string;
        commands: string[];
    }>;
    template: {
        enabled: true;
        sendText: false;
        path: string;
        render: {
            width: number;
            height: number;
            type: string;
            quality: number;
            fullPage: boolean;
            background: boolean;
        };
    };
    theme: {
        backgroundColor: string;
        titleColor: string;
        textColor: string;
        statusColors: {
            enabled: string;
            disabled: string;
        };
        commandColor: string;
        borderColor: string;
    };
}

@plugins({
    id: "manager",
    name: "插件管理",
    version: "1.0.0",
    describe: "管理机器人插件",
    author: "枫叶秋林",
    help: {
        enabled: true,
        description: "显示帮助信息"
    }
})
export class Manager {
    @permission(PermissionLevel.ADMIN)
    @runcod("list", "列出所有插件")
    async listPlugins(context: MessageContext): Promise<PluginResponse> {
        const plugins = PluginManager.getPlugins();
        
        // 构建检查上下文
        const checkContext = {
            type: context.message_type === 'group' ? 'group' as const : 'user' as const,
            id: context.message_type === 'group' ? String(context.group_id) : String(context.user_id)
        };
        
        const pluginStatuses = await Promise.all(plugins.map(async p => {
            const isEnabled = await PluginManager.isPluginEnabled(p.id || '', checkContext);
            return {
                id: p.id || '',
                name: p.name || '',
                status: isEnabled ? "已启用" : "已禁用",
                version: p.version,
                author: p.author,
                commands: (p.commands || []).map((cmd: Command) => {
                    const cmdStr = cmd.cmd;
                    const aliases = cmd.aliases || [];
                    const prefix = cmd.cmdPrefix || '#';
                    const pluginId = cmd.pluginId || p.id;
                    
                    // 构建完整命令字符串
                    const fullCmd = `${prefix}${pluginId} ${cmdStr}`;
                    
                    // 如果有别名，添加别名信息
                    if (aliases.length > 0) {
                        const aliasesStr = aliases.map((alias: string) => `${prefix}${pluginId} ${alias}`).join(', ');
                        return `${fullCmd} (别名: ${aliasesStr})`;
                    }
                    
                    return fullCmd;
                })
            };
        }));
        
        return {
            title: "插件列表",
            message: "当前已安装的插件：",
            plugins: pluginStatuses,
            template: {
                enabled: true,
                sendText: false,
                path: path.join(__dirname, '..', 'resources', 'manager', 'list.html'),
                render: {
                    width: 800,
                    height: 600,
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
                statusColors: {
                    enabled: '#52c41a',
                    disabled: '#ff4d4f'
                },
                commandColor: '#666666',
                borderColor: '#e8e8e8'
            }
        };
    }

    @permission(PermissionLevel.ADMIN)
    @runcod(["enable", "启用"], "启用插件")
    async enable(
        @param("插件ID", ParamType.String) pluginId: string,
        context: MessageContext
    ): Promise<PluginResponse> {
        try {
            // 检查参数是否存在
            if (!pluginId) {
                return this.createErrorResponse("启用插件失败", "请指定要启用的插件ID");
            }

            // 添加参数日志
            botlogger.info('启用插件 - 参数信息:', {
                pluginId,
                context: {
                    message_type: context.message_type,
                    group_id: context.group_id,
                    user_id: context.user_id
                }
            });

            const enableContext = context.message_type === 'group' && context.group_id
                ? { type: 'group' as const, id: String(context.group_id) }
                : { type: 'user' as const, id: String(context.user_id) };

            await PluginManager.enablePlugin(pluginId, enableContext);
            return {
                title: "启用插件",
                message: `插件 ${pluginId} 已成功启用`,
                template: {
                    enabled: true,
                    sendText: false,
                    path: path.join(__dirname, '..', 'resources', 'manager', 'result.html'),
                    render: {
                        width: 600,
                        height: 300,
                        type: 'png',
                        quality: 100,
                        fullPage: false,
                        background: true
                    }
                },
                theme: {
                    backgroundColor: '#ffffff',
                    titleColor: '#52c41a',
                    textColor: '#333333',
                    statusColors: {
                        enabled: '#52c41a',
                        disabled: '#ff4d4f'
                    },
                    commandColor: '#666666',
                    borderColor: '#e8e8e8'
                }
            };
        } catch (error) {
            return this.createErrorResponse("启用插件失败", error instanceof Error ? error.message : "未知错误");
        }
    }

    @permission(PermissionLevel.ADMIN)
    @runcod(["disable", "禁用"], "禁用插件")
    async disable(
        @param("插件ID", ParamType.String) pluginId: string,
        context: MessageContext
    ): Promise<PluginResponse> {
        try {
            // 检查参数是否存在
            if (!pluginId) {
                return this.createErrorResponse("禁用插件失败", "请指定要禁用的插件ID");
            }

            // 添加参数日志
            botlogger.info('禁用插件 - 参数信息:', {
                pluginId,
                context: {
                    message_type: context.message_type,
                    group_id: context.group_id,
                    user_id: context.user_id
                }
            });

            const disableContext = context.message_type === 'group' && context.group_id
                ? { type: 'group' as const, id: String(context.group_id) }
                : { type: 'user' as const, id: String(context.user_id) };

            await PluginManager.disablePlugin(pluginId, disableContext);
            return {
                title: "禁用插件",
                message: `插件 ${pluginId} 已成功禁用`,
                template: {
                    enabled: true,
                    sendText: false,
                    path: path.join(__dirname, '..', 'resources', 'manager', 'result.html'),
                    render: {
                        width: 600,
                        height: 300,
                        type: 'png',
                        quality: 100,
                        fullPage: false,
                        background: true
                    }
                },
                theme: {
                    backgroundColor: '#ffffff',
                    titleColor: '#ff4d4f',
                    textColor: '#333333',
                    statusColors: {
                        enabled: '#52c41a',
                        disabled: '#ff4d4f'
                    },
                    commandColor: '#666666',
                    borderColor: '#e8e8e8'
                }
            };
        } catch (error) {
            return this.createErrorResponse("禁用插件失败", error instanceof Error ? error.message : "未知错误");
        }
    }

    // 添加辅助方法
    private createErrorResponse(title: string, message: string): PluginResponse {
        return {
            title,
            message,
            template: {
                enabled: true,
                sendText: false,
                path: path.join(__dirname, '..', 'resources', 'manager', 'result.html'),
                render: {
                    width: 600,
                    height: 300,
                    type: 'png',
                    quality: 100,
                    fullPage: false,
                    background: true
                }
            },
            theme: {
                backgroundColor: '#ffffff',
                titleColor: '#ff4d4f',
                textColor: '#333333',
                statusColors: {
                    enabled: '#52c41a',
                    disabled: '#ff4d4f'
                },
                commandColor: '#666666',
                borderColor: '#e8e8e8'
            }
        };
    }
}

