import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import botlogger from './logger';
import { MessageContext } from './plugins';  // 从 plugins.ts 导入 MessageContext 类型
import { getUserPermissionLevel } from './permission-manager';  // 导入权限检查函数
import { economy } from './economy';  // 导入经济系统

// 添加配置接口
interface BotConfig {
    bot: {
        baseUrl: string;
        accessToken: string;
        DEBUG: boolean;
        cmd: string;
    };
}

// 读取配置文件
const configPath = path.join(__dirname, '..', 'config', 'bot.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as BotConfig;
const CMD_PREFIX = config.bot.cmd;  // 获取指令前置符

// 参数类型枚举
export const ParamType = {
    String: "string" as const,
    Number: "number" as const,
    Boolean: "boolean" as const,
    Rest: "rest" as const
} as const;

// 从对象值中获取类型
export type ParamType = typeof ParamType[keyof typeof ParamType];

// 参数元数据接口
interface ParamMetadata {
    name: string;
    type: ParamType;
    index: number;
    optional: boolean;
}

// 存储参数元数据
export const paramMetadata = new Map<Function, ParamMetadata[]>();

// 修改参数装饰器
export function param(name: string, type: ParamType = ParamType.String): ParameterDecorator {
    return function(target: any, propertyKey: string | symbol, parameterIndex: number) {
        const fn = target[propertyKey];
        let metadata = paramMetadata.get(fn);
        
        if (!metadata) {
            metadata = [];
            paramMetadata.set(fn, metadata);
        }
        
        const paramData: ParamMetadata = {
            name,
            type,
            index: parameterIndex,
            optional: false
        };

        metadata[parameterIndex] = paramData;
    };
}

// 修改插件装饰器配置接口
export interface PluginConfig {
    id: string;
    name: string;
    version?: string;
    describe?: string;
    author?: string;
    help?: {
        enabled?: boolean;
        command?: string[];
        description?: string;
    };
}

// 修改插件装饰器
export function plugins(config: PluginConfig): ClassDecorator {
    return function (target: any): void {
        // 保存插件配置
        target.prototype.plugincfg = config;
        
        // 确保插件名称正确
        const existingPlugin = commandList.find((x) => x.class === target);
        let plugin: Plugin;
        
        if (existingPlugin) {
            // 更新现有插件的配置
            existingPlugin.name = config.name;
            plugin = existingPlugin;
        } else {
            // 添加新插件
            plugin = {
                id: config.id,
                name: config.name,
                class: target,
                commands: [] as Command[]
            };
            commandList.push(plugin);
            
            // 添加调试日志
            botlogger.info(`注册插件: ${config.name}`);
            botlogger.info(`插件类: ${target.name}`);
        }

        // 添加帮助命令
        if (config.help?.enabled !== false) {
            const helpCommand: Command = {
                cmd: 'help',
                desc: config.help?.description || "显示帮助信息",
                aliases: ['帮助', '?'],
                template: {
                    enabled: true,
                    sendText: false
                },
                cmdPrefix: CMD_PREFIX,
                pluginId: config.id,
                class: target,
                fn: async function(): Promise<object> {
                    const plugin = commandList.find(p => p.class === target);
                    if (!plugin) {
                        return {
                            message: "错误: 找不到插件信息"
                        };
                    }

                    // 过滤并格式化命令列表
                    const commands = plugin.commands
                        .filter(cmd => !cmd.cmd.endsWith('help'))
                        .map(cmd => {
                            const fullCmd = `${CMD_PREFIX}${plugin.id} ${cmd.cmd}`;
                            const aliases = cmd.aliases?.map(alias => 
                                `${CMD_PREFIX}${plugin.id} ${alias}`
                            ) || [];
                            
                            return {
                                name: cmd.cmd,
                                fullCmd,
                                desc: cmd.desc,
                                aliases
                            };
                        });

                    // 返回支持模板的响应对象
                    return {
                        title: plugin.name,
                        version: config.version || '',
                        description: config.describe || '',
                        author: config.author || '',
                        commands,
                        pluginId: plugin.id,
                        cmdPrefix: CMD_PREFIX,
                        template: {
                            name: 'help',
                            path: path.join(__dirname, '..', 'resources', 'help', 'help.html'),
                            enabled: true,
                            sendText: false,
                            render: {
                                width: 800,
                                height: 600,
                                type: 'png',
                                quality: 100,
                                fullPage: false,
                                background: true
                            }
                        },
                        toString() {
                            const commandsText = commands.map(cmd => {
                                let text = `${cmd.fullCmd} - ${cmd.desc}`;
                                if (cmd.aliases.length > 0) {
                                    text += `\n  别名: ${cmd.aliases.join(', ')}`;
                                }
                                return text;
                            }).join('\n');

                            return [
                                `=== ${plugin.name} ===`,
                                `版本: ${config.version}`,
                                config.describe ? `描述: ${config.describe}` : '',
                                config.author ? `作者: ${config.author}` : '',
                                '',
                                '可用命令:',
                                commandsText
                            ].filter(Boolean).join('\n');
                        }
                    };
                }
            };

            plugin.commands.push(helpCommand);
            botlogger.info(`注册帮助命令[${plugin.id}]: ${CMD_PREFIX}${plugin.id} help`);
        }
    };
}

// 在 decorators.ts 中定义统一的接口
export interface Command {
    cmd: string;
    desc: string;
    fn: Function;
    aliases?: string[];
    cmdPrefix: string;
    pluginId: string;
    class: new () => any;
    template?: {
        enabled: boolean;
        sendText: boolean;
        [key: string]: any;
    };
}

// 更新 Plugin 接口
export interface Plugin {
    id: string;
    name: string;
    commands: Command[];
    class: any;
    version?: string;
    author?: string;
    describe?: string;
}

// 存储命令的数组
export const commandList: Plugin[] = [];

// 添加模板配置接口
interface TemplateConfig {
    enabled: boolean;
    sendText: boolean;
    [key: string]: any;
}

// 修改命令装饰器配置
interface CommandConfig {
    template?: TemplateConfig;
    [key: string]: any;
}

// 修改 runcod 装饰��
export function runcod(cmd: string | string[], desc: string, config: CommandConfig = {}): MethodDecorator {
    return function(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        // 延迟执行命令注册
        const originalMethod = descriptor.value;
        descriptor.value = function(...args: any[]) {
            // 获取插件配置
            const pluginConfig = target.constructor.prototype.plugincfg;
            if (!pluginConfig) {
                botlogger.error(`未找到插件配置: ${target.constructor.name}`);
                return originalMethod.apply(this, args);
            }
            
            const pluginName = pluginConfig.name;
            
            // 获取或创建插件的命令列表
            let plugin = commandList.find((p: Plugin) => p.class === target.constructor);
            if (!plugin) {
                plugin = {
                    id: pluginConfig.id,
                    name: pluginName,
                    commands: [] as Command[],
                    class: target.constructor
                };
                commandList.push(plugin);
                botlogger.info(`创建新插件: ${pluginName}`);
            }

            // 如果命令还没有注册
            if (!descriptor.value.isCommand) {
                const cmdList = Array.isArray(cmd) ? cmd : [cmd];
                const allCmds = cmdList.map(c => c);

                // 第一个命令作为主命令，其他的作为别名
                const [mainCmd, ...aliases] = allCmds;
                
                // 添加命令
                const command: Command = {
                    cmd: mainCmd,
                    desc,
                    fn: descriptor.value,
                    aliases,
                    cmdPrefix: CMD_PREFIX,
                    pluginId: plugin.id,
                    class: target.constructor,
                    template: {
                        enabled: false,
                        sendText: true,
                        ...(config.template || {})
                    }
                };
                
                plugin.commands.push(command);

                // 修改日志输出
                botlogger.info(`注册命令[${plugin.id}]: ${CMD_PREFIX}${plugin.id} ${mainCmd}`);
                
                // 添加命令标记
                descriptor.value.isCommand = true;
                descriptor.value.cmd = Array.isArray(cmd) ? cmd[0] : cmd;
                descriptor.value.desc = desc;
                descriptor.value.aliases = Array.isArray(cmd) ? cmd.slice(1) : [];
            }
            
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}

// 会话状态接口
export interface SessionState {
    step: number;
    lastTime: number;
    data?: any;
}

// 会话选项接口
export interface SessionOptions {
    timeout: number;
    steps: SessionStep[];
}

// 会话步骤接口
export interface SessionStep {
    prompt: string;
    param: string;
    type: string;
    handler?: (input: string, data: any) => Promise<any> | any;
}

// 存储会话状态
export const sessions = new Map<string, SessionState>();

// 存储会话元数据
export const sessionMetadata = new Map<any, Map<string | symbol, SessionOptions>>();

// 会话装饰器工厂
export function session(options: SessionOptions) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(context: MessageContext, ...args: any[]) {
            // 检查消息格式
            if(!context?.message?.length || !context.message[0]?.data?.text) {
                return "消息格式错误";
            }

            // 生成会话ID
            const sessionId = `${context.group_id || context.user_id}_${context.user_id}`;
            const messageText = context.message[0].data.text;
            
            // 获取或创建会话状态
            let state = sessions.get(sessionId);
            
            // 如果是命令触发,重置会话
            if(messageText.startsWith('#')) {
                state = {
                    step: 0,
                    lastTime: Date.now(),
                    data: {}
                };
                sessions.set(sessionId, state);
                return "你好!请输入你的名字";
            }
            
            // 如果不是命令且没有会话状态,忽略消息
            if(!state) {
                return;
            }
            
            // 检查会话超时
            if(Date.now() - state.lastTime > options.timeout) {
                sessions.delete(sessionId);
                return "会话已超时,请重新开始";
            }
            
            // 更新最后活动时间
            state.lastTime = Date.now();
            
            // 调用原始方法处理消息
            const result = await originalMethod.call(this, context, state);
            
            // 更新会话状态
            if(result) {
                if(state.step < options.steps.length - 1) {
                    state.step++;
                    sessions.set(sessionId, state);
                } else {
                    // 会话结束
                    sessions.delete(sessionId);
                }
            }
            
            return result;
        };
        
        return descriptor;
    };
}

// 添加定时任务装饰器
export function schedule(cron: string): MethodDecorator {
    return function(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        // 保存原始方法
        const originalMethod = descriptor.value;

        // 添加定时任务标记
        descriptor.value.isScheduled = true;
        descriptor.value.cron = cron;
        descriptor.value.methodName = propertyKey;

        // 返回修改后的描述符
        return descriptor;
    };
}

// 权限级别枚举
export enum PermissionLevel {
    EVERYONE = 0,      // 所有人
    USER = 1,          // 普通用户
    ADMIN = 2,         // 管理员
    SUPER_ADMIN = 3,   // 超级管理员
    OWNER = 4          // 机器人拥有者
}

// 权限装饰器元数据
interface PermissionMetadata {
    level: PermissionLevel;
    customCheck?: (userId: string, context: MessageContext) => Promise<boolean>;
}

// 权限装饰器工厂
export function permission(level: PermissionLevel, customCheck?: (userId: string, context: MessageContext) => Promise<boolean>): MethodDecorator {
    return function(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        // 存储权限元数据
        Reflect.defineMetadata('permission', { level, customCheck }, descriptor.value);
        return descriptor;
    };
}

// 权限检查函数
export async function checkPermission(userId: string, context: MessageContext, fn: Function): Promise<boolean> {
    const metadata: PermissionMetadata = Reflect.getMetadata('permission', fn);
    if (!metadata) return true; // 没有权限要求则默认允许

    // 检查用户权限级别
    const userLevel = await getUserPermissionLevel(userId);
    if (userLevel < metadata.level) return false;

    // 执行自定义检查
    if (metadata.customCheck) {
        return await metadata.customCheck(userId, context);
    }

    return true;
}

// 金币检查装饰器
export function requireCoins(amount: number) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(context: MessageContext, ...args: any[]) {
            // 获取用户数据
            const userDataPath = path.join(__dirname, '..', 'data', 'users.yaml');
            const userData = yaml.load(fs.readFileSync(userDataPath, 'utf8')) as { [key: string]: any };
            const userId = context.user_id;

            if (!userData[userId] || userData[userId].coins < amount) {
                return {
                    title: "金币不足",
                    message: `该操作需要 ${amount} 金币，当前金币不足`,
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            // 扣除金币
            userData[userId].coins -= amount;
            fs.writeFileSync(userDataPath, yaml.dump(userData));

            // 执行原始方法
            return await originalMethod.apply(this, [context, ...args]);
        };

        return descriptor;
    };
}

// 金币变更装饰器
export function coins(amount: number, reason: string = "未知原因") {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(context: MessageContext, ...args: any[]) {
            const userId = context.user_id;

            if (amount < 0) {
                // 扣除金币
                const success = await economy.deductCoins(userId, Math.abs(amount), reason);
                if (!success) {
                    return {
                        title: "金币不足",
                        message: `该操作需要 ${Math.abs(amount)} 金币，当前余额不足`,
                        template: {
                            enabled: true,
                            path: path.resolve(__dirname, '..', 'resources', 'common', 'error.html')
                        }
                    };
                }
            } else if (amount > 0) {
                // 添加金币
                await economy.addCoins(userId, amount, reason);
            }

            // 执行原始方法
            return await originalMethod.apply(this, [context, ...args]);
        };

        return descriptor;
    };
}

// 动态金币变更装饰器
export function dynamicCoins(amountFn: (context: MessageContext, ...args: any[]) => number, reason: string = "未知原因") {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(context: MessageContext, ...args: any[]) {
            const userId = context.user_id;
            const amount = amountFn(context, ...args);

            if (amount < 0) {
                const success = await economy.deductCoins(userId, Math.abs(amount), reason);
                if (!success) {
                    return {
                        title: "金币不足",
                        message: `该操作需要 ${Math.abs(amount)} 金币，当前余额不足`,
                        template: {
                            enabled: true,
                            path: path.resolve(__dirname, '..', 'resources', 'common', 'error.html')
                        }
                    };
                }
            } else if (amount > 0) {
                await economy.addCoins(userId, amount, reason);
            }

            return await originalMethod.apply(this, [context, ...args]);
        };

        return descriptor;
    };
} 