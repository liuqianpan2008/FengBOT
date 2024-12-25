import { bot } from "./bot";
import botlogger from "./logger";
import { 
    param, 
    plugins as pluginsDecorator, 
    ParamType, 
    paramMetadata, 
    commandList, 
    Command,
    Plugin,
    PermissionLevel
} from './decorators';
import * as path from 'path';
import * as fs from 'fs';
import { PluginManager } from "./plugin-manager";
import { promises as fsPromises } from 'fs';
import * as yaml from 'js-yaml';
import * as cron from 'node-cron';
import { HtmlImg } from "./puppeteer";
import { checkPermission } from "./decorators";
import 'reflect-metadata';

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

// 导出装饰器
export { param, ParamType };
export const plugins = pluginsDecorator;
export { config };  // 导出配置对象

// 修改类型定义
interface MessageType {
    type: string;
    data: {
        text?: string;
        [key: string]: any;
    };
}

export interface MessageContext {
    message: MessageType[];
    quick_action: (actions: any[]) => Promise<any>;
    user_id: string;
    message_type?: 'private' | 'group';
    group_id?: string;
    message_id?: number;
    sender: {
        nickname?: string;
        user_id?: string;
    };
}

// 消息类型定义
type MessageData = {
    type: "reply";
    data: {
        id: string;
    };
} | {
    type: "text";
    data: {
        text: string;
    };
} | {
    type: "image";
    data: {
        file: string;
        name?: string;
    };
};

// 创建消息工厂函数
function createTextMessage(text: string): MessageData {
    return {
        type: "text",
        data: { text }
    };
}

function createImageMessage(base64Data: string): MessageData {
    return {
        type: "image",
        data: {
            file: `base64://${base64Data}`,
            name: 'image.png'
        }
    };
}

function createReplyMessage(messageId: number | string): MessageData {
    return {
        type: "reply",
        data: {
            id: String(messageId)
        }
    };
}

// 修改插件查找函数
function findPlugin(pluginId: string): Plugin | undefined {
    return commandList.find((p: Plugin) => p.id === pluginId);
}

// 修改命令查找函数
function findCommand(plugin: Plugin, cmdName: string): Command | undefined {
    return plugin.commands.find((cmd: Command) => {
        // 从完整命令中提取命令名
        const cmdParts = cmd.cmd.split(/\s+/);
        const matchCmd = cmdParts[cmdParts.length - 1] === cmdName;
        
        // 检查别名
        const matchAlias = cmd.aliases?.some((alias: string) => {
            const aliasParts = alias.split(/\s+/);
            return aliasParts[aliasParts.length - 1] === cmdName;
        });
        
        return matchCmd || matchAlias;
    });
}

// 创建并导出 QQbot 实例
export const QQbot = new bot();

// 添加插件加载函数
async function loadPlugins(): Promise<void> {
    try {
        const pluginsDir = path.join(__dirname, '..', 'plugins');
        const files = await fsPromises.readdir(pluginsDir);
        
        for (const file of files) {
            if (file.endsWith('.ts') && file !== 'index.ts') {
                const filePath = path.join(pluginsDir, file);
                try {
                    // 动态导入插件
                    const module = await import(filePath);
                    const pluginClasses = Object.values(module).filter(
                        value => typeof value === 'function' && value.prototype?.plugincfg
                    );

                    for (const PluginClass of pluginClasses) {
                        const instance = new (PluginClass as any)();
                        const pluginConfig = instance.constructor.prototype.plugincfg;
                        
                        if (pluginConfig) {
                            const plugin: Plugin = {
                                id: pluginConfig.id,
                                name: pluginConfig.name,
                                commands: [] as Command[],
                                class: instance.constructor,
                                version: pluginConfig.version,
                                author: pluginConfig.author,
                                describe: pluginConfig.describe
                            };
                            
                            // 注册插件
                            commandList.push(plugin);
                            PluginManager.registerPlugin(plugin);
                            botlogger.info(`注册插件[${plugin.id}]: ${plugin.name}`);

                            // 添加帮助命令
                            if (pluginConfig.help?.enabled !== false) {
                                addHelpCommand(plugin, pluginConfig);
                            }

                            // 触发装饰器
                            await initializePluginCommands(instance);

                            // 初始化定时任务
                            await initializeScheduledTasks(instance);
                        }
                    }
                } catch (error) {
                    botlogger.error(`加载插件文件失败 ${file}:`, error);
                }
            }
        }
    } catch (error) {
        botlogger.error("加载插件目录失败:", error);
    }
}

// 修改帮助命令配置
function addHelpCommand(plugin: Plugin, pluginConfig: any): void {
    const helpCommand: Command = {
        cmd: 'help',
        desc: pluginConfig.help?.description || "显示帮助信息",
        aliases: ['帮助', '?'],
        cmdPrefix: CMD_PREFIX,
        pluginId: plugin.id,
        class: plugin.class,
        fn: async function() {
            // 获取所有非帮助命令
            const commands = plugin.commands
                .filter(cmd => cmd.cmd !== 'help' && cmd.cmd !== '帮助' && cmd.cmd !== '?')
                .map(cmd => ({
                    name: cmd.cmd,
                    fullCmd: `${CMD_PREFIX}${plugin.id} ${cmd.cmd}`,
                    desc: cmd.desc,
                    aliases: cmd.aliases?.map(alias => `${CMD_PREFIX}${plugin.id} ${alias}`) || []
                }));

            // 构建帮助响应对象
            const helpResponse = {
                title: plugin.name,
                version: pluginConfig.version || '',
                description: pluginConfig.describe || '',
                author: pluginConfig.author || '',
                commands,
                pluginId: plugin.id,
                cmdPrefix: CMD_PREFIX,
                theme: {
                    backgroundColor: '#ffffff',
                    titleColor: '#333333',
                    descriptionColor: '#666666',
                    commandColor: '#000000',
                    aliasColor: '#888888'
                },
                template: {
                    enabled: true,
                    sendText: false,
                    path: path.join(__dirname, '..', 'resources', 'help', 'index.html'),
                    render: {
                        width: 800,
                        height: 600,
                        type: 'png',
                        quality: 100,
                        fullPage: false,
                        background: true
                    }
                }
            };

            // 禁用 toString 方法
            Object.defineProperty(helpResponse, 'toString', {
                enumerable: false,
                configurable: true,
                value: undefined
            });

            botlogger.info('生成帮助信息:', JSON.stringify({
                plugin: plugin.id,
                commandCount: commands.length,
                commands: commands.map(c => c.name)
            }));

            return helpResponse;
        }
    };

    plugin.commands.push(helpCommand);
    botlogger.info(`注册帮助命令[${plugin.id}]: ${CMD_PREFIX}${plugin.id} help`);
}

// 修改 createHelpFunction 中的命令格式化
function createHelpFunction(plugin: Plugin, pluginConfig: any) {
    return async function(): Promise<{
        title: string;
        version: string;
        description: string;
        author: string;
        commands: CommandData[];
        template: string;
        templatePath: string;
        toString(): string;
    }> {
        botlogger.info('创建帮助响应:', JSON.stringify({
            plugin: {
                id: plugin.id,
                name: plugin.name,
                commandCount: plugin.commands.length
            },
            config: pluginConfig
        }));

        // 过滤掉帮助命令
        const commands = plugin.commands
            .filter(cmd => !cmd.cmd.endsWith('help'))
            .map(cmd => {
                const cmdName = cmd.cmd.split(' ')[1] || cmd.cmd;
                return {
                    name: cmdName,
                    fullCmd: cmdName,  // 不再添加前缀
                    desc: cmd.desc,
                    aliases: cmd.aliases?.map(a => {
                        const aliasName = a.split(' ')[1] || a;
                        return aliasName;  // 不再添加前缀
                    }) || []
                };
            });

        return {
            title: plugin.name,
            version: pluginConfig.version || '',
            description: pluginConfig.describe || '',
            author: pluginConfig.author || '',
            commands,
            template: 'help',
            templatePath: 'resources/help/index.html',
            toString() {
                const commandsText = commands.map(cmd => {
                    let text = `${CMD_PREFIX}${plugin.id} ${cmd.fullCmd} - ${cmd.desc}`;
                    if (cmd.aliases.length > 0) {
                        text += `\n  别名: ${cmd.aliases.map(a => `${CMD_PREFIX}${plugin.id} ${a}`).join(', ')}`;
                    }
                    return text;
                }).join('\n');

                return [
                    `=== ${plugin.name} ===`,
                    `版本: ${pluginConfig.version}`,
                    pluginConfig.describe ? `描述: ${pluginConfig.describe}` : '',
                    pluginConfig.author ? `作者: ${pluginConfig.author}` : '',
                    '',
                    '可用命令:',
                    commandsText
                ].filter(Boolean).join('\n');
            }
        };
    };
}

// 添加命令数据接口
interface CommandData {
    name: string;
    fullCmd: string;
    desc: string;
    aliases: string[];
}

// 初始化插件命令
async function initializePluginCommands(instance: any): Promise<void> {
    const methods = Object.getOwnPropertyNames(instance.constructor.prototype)
        .filter(name => name !== 'constructor');
    
    for (const methodName of methods) {
        const method = instance.constructor.prototype[methodName];
        try {
            if (typeof method === 'function') {
                method.call(instance, '', '');
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('Cannot read properties of undefined')) {
                continue;
            }
            botlogger.error(`触发装饰器时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}

// 初始化定时任务
async function initializeScheduledTasks(instance: any): Promise<void> {
    const methods = Object.getOwnPropertyNames(instance.constructor.prototype)
        .filter(name => name !== 'constructor');
    
    for (const methodName of methods) {
        const method = instance.constructor.prototype[methodName];
        if (method.isScheduled) {
            try {
                // 创建定时任务
                cron.schedule(method.cron, async () => {
                    try {
                        await method.call(instance);
                    } catch (error) {
                        botlogger.error(`执行定时任务失败 [${methodName}]:`, error);
                    }
                });
                botlogger.info(`注册定时任务 [${methodName}]: ${method.cron}`);
            } catch (error) {
                botlogger.error(`注册定时任务失败 [${methodName}]:`, error);
            }
        }
    }
}

// 修改 runplugins 函数
export async function runplugins() {
    try {
        // 初始化插件管理器
        await PluginManager.init();
        
        // 清空现有命令列表
        commandList.length = 0;
        
        // 注册插件
        botlogger.info("开始注册插件...");
        
        // 自动加载插件
        await loadPlugins();
        
        // 设置消息处理器
        QQbot.on('message', async (context: MessageContext) => {
            try {
                const msg = context.message[0].data.text || '';
                botlogger.info('收到消息:', msg);

                // 检查是否是命令
                if (!msg.startsWith(CMD_PREFIX)) {
                    return;
                }

                // 解析命令
                const parts = msg.slice(CMD_PREFIX.length).trim().split(/\s+/);
                const pluginId = parts[0];
                const cmdName = parts[1];
                const args = parts.slice(2);

                botlogger.info('尝试匹配插件:', pluginId);

                // 显示可用插件
                botlogger.info('可用插件:');
                commandList.forEach(p => {
                    botlogger.info(`  [${p.id}]: ${p.name}`);
                });

                // 查找插件
                const plugin = findPlugin(pluginId);
                if (!plugin) {
                    botlogger.info(`插件未找到: ${pluginId}`);
                    return;
                }

                botlogger.info(`找到插件[${plugin.id}]: ${plugin.name}`);

                // 显示可用命令
                botlogger.info('可用命令:');
                plugin.commands.forEach(cmd => {
                    botlogger.info(`  ${CMD_PREFIX}${plugin.id} ${cmd.cmd}`);
                });

                // 查找命令
                const command = findCommand(plugin, cmdName);
                if (!command) {
                    botlogger.info(`命令未找到: ${cmdName}`);
                    return;
                }

                botlogger.info(`找到命令: ${CMD_PREFIX}${plugin.id} ${command.cmd}`);

                // 执行命令
                await handleCommand(context, plugin, command, args);

            } catch (error) {
                botlogger.error("处理消息时出错:", error);
                await context.quick_action([{
                    type: 'text',
                    data: { text: `处理消息时出错: ${error instanceof Error ? error.message : '未知错误'}` }
                }]);
            }
        });

        botlogger.info("插件注册完成");
        botlogger.info("命令表:");
        for (const plugin of commandList) {
            botlogger.info(`[${plugin.id}]:`);
            for (const cmd of plugin.commands) {
                botlogger.info(`  ${CMD_PREFIX}${plugin.id} ${cmd.cmd}`);
            }
        }
        
    } catch (error) {
        botlogger.error("注册插件时出错:", error);
    }
}

// 修改 handleCommand 函数
async function handleCommand(context: MessageContext, plugin: Plugin, command: Command, args: string[]): Promise<void> {
    try {
        // 检查插件是否被禁用
        if (!await PluginManager.checkPluginEnabled(plugin.id || '', context)) {
            await context.quick_action([{
                type: 'text',
                data: { text: `插件 ${plugin.name} [${plugin.id}] 已被禁用` }
            }]);
            return;
        }

        // 检查权限
        const hasPermission = await checkPermission(context.user_id, context, command.fn);
        if (!hasPermission) {
            const metadata = Reflect.getMetadata('permission', command.fn) as { level: PermissionLevel };
            const levelName = PermissionLevel[metadata.level];
            await context.quick_action([{
                type: 'text',
                data: { text: `权限不足 - 需要 ${levelName} 权限` }
            }]);
            return;
        }

        // 解析参数 - 传入完整消息文本
        const message = context.message[0].data.text || '';
        const parsedArgs = await parseCommandParams(message, context);

        botlogger.info('命令参数解析完成:'+ JSON.stringify({
            command: command.cmd,
            args: parsedArgs.slice(0, -1) // 不显示 context 对象
        }));

        // 执行命令
        const pluginInstance = new (command.class)();
        const result = await command.fn.apply(pluginInstance, parsedArgs);

        // 检查是否是群消息
        const isGroupMessage = context.message_type === 'group';
        const baseMessage = isGroupMessage && context.message_id 
            ? [createReplyMessage(context.message_id)]
            : [];

        // 检查是否有模板配置
        if (result?.template?.enabled) {
            try {
                const templatePath = result.template.path;
                if (!templatePath || !fs.existsSync(templatePath)) {
                    throw new Error(`Template not found: ${templatePath}`);
                }

                // 生成图片
                const htmlImg = new HtmlImg();
                try {
                    const img = await htmlImg.render({
                        template: templatePath,
                        data: result,
                        width: result.template.render?.width || 800,
                        height: result.template.render?.height || 600,
                        type: result.template.render?.type || 'png',
                        quality: result.template.render?.quality || 100,
                        fullPage: result.template.render?.fullPage || false,
                        background: result.template.render?.background || true
                    });

                    // 发送图片
                    const base64Data = Buffer.from(img).toString('base64');
                    const imageMessage = createImageMessage(base64Data);
                    const message = [...baseMessage, imageMessage];

                    if (isGroupMessage && context.group_id) {
                        await QQbot.send_group_msg({
                            group_id: Number(context.group_id),
                            message: message as any[]
                        });
                    } else {
                        await QQbot.send_private_msg({
                            user_id: Number(context.user_id),
                            message: message as any[]
                        });
                    }

                    // 如果配置了同时发送文字
                    if (result.template.sendText) {
                        const text = result?.toString?.() || String(result);
                        const textMessage = createTextMessage(text);
                        const textOnlyMessage = [...baseMessage, textMessage];

                        if (isGroupMessage && context.group_id) {
                            await QQbot.send_group_msg({
                                group_id: Number(context.group_id),
                                message: textOnlyMessage as any[]
                            });
                        } else {
                            await QQbot.send_private_msg({
                                user_id: Number(context.user_id),
                                message: textOnlyMessage as any[]
                            });
                        }
                    }

                } finally {
                    await htmlImg.close();
                }
            } catch (error) {
                botlogger.error('图片生成失败:', error);
                // 如果图片生成失败，发送文本
                const text = result?.toString?.() || String(result);
                const textMessage = createTextMessage(text);
                const message = [...baseMessage, textMessage];

                if (isGroupMessage && context.group_id) {
                    await QQbot.send_group_msg({
                        group_id: Number(context.group_id),
                        message: message as any[]
                    });
                } else {
                    await QQbot.send_private_msg({
                        user_id: Number(context.user_id),
                        message: message as any[]
                    });
                }
            }
        } else {
            // 发送普通文本响应
            const message = [...baseMessage, createTextMessage(result)];

            if (isGroupMessage && context.group_id) {
                await QQbot.send_group_msg({
                    group_id: Number(context.group_id),
                    message: message
                });
            } else {
                await QQbot.send_private_msg({
                    user_id: Number(context.user_id),
                    message: message
                });
            }
        }

    } catch (error: unknown) {
        botlogger.error('执行命令出错:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        await context.quick_action([{
            type: 'text',
            data: { text: `执行命令时出错: ${errorMessage}` }
        }]);
    }
}

// 处理命令响应
async function handleCommandResponse(response: any): Promise<{ image?: Buffer; text?: string } | undefined> {
    if (!response) return;

    if (response.template && typeof response.template === 'object' && response.template.enabled) {
        try {
            const templatePath = response.template.path;
            if (!templatePath || !fs.existsSync(templatePath)) {
                throw new Error(`Template not found: ${templatePath}`);
            }

            // 生成图片
            const htmlImg = new HtmlImg();
            try {
                const img = await htmlImg.render({
                    template: templatePath,
                    data: response,
                    width: response.template.render?.width || 800,
                    height: response.template.render?.height || 600,
                    type: response.template.render?.type || 'png',
                    quality: response.template.render?.quality || 100,
                    fullPage: response.template.render?.fullPage || false,
                    background: response.template.render?.background || true
                });

                return {
                    image: Buffer.from(img),
                    text: response.template.sendText ? response.toString() : undefined
                };
            } finally {
                await htmlImg.close();
            }
        } catch (error) {
            botlogger.error('图片生成失败:', error);
            return {
                text: response.toString()
            };
        }
    }

    return {
        text: response.toString()
    };
}

// 导出加载插件函数
export async function loadplugins() {
    await runplugins();
}

export const getCommands = () => commandList;

// 修改 help 命令的显示
function formatCommandHelp(cmd: Command): string {
    let help = cmd.cmd;
    if (cmd.aliases && cmd.aliases.length > 0) {
        help += ` (${cmd.aliases.join(', ')})`;
    }
    return help;
}

// 修改 runcod 装饰器
export function runcod(cmd: string | string[], desc: string): MethodDecorator {
    return function decorator(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        // 获取插件配置
        const pluginConfig = target.constructor.prototype.plugincfg;
        if (!pluginConfig) {
            botlogger.error(`未找到插件配置: ${target.constructor.name}`);
            return descriptor;
        }
        
        const pluginId = pluginConfig.id;
        const pluginName = pluginConfig.name;
        
        // 获或创建插件的命令列表
        let plugin = commandList.find((p: Plugin) => p.class === target.constructor);
        if (!plugin) {
            plugin = {
                id: pluginId,
                name: pluginName,
                commands: [],
                class: target.constructor
            };
            commandList.push(plugin);
            botlogger.info(`创建新插件[${pluginId}]: ${pluginName}`);
        }

        // 使用新的命令格式
        const cmdList = Array.isArray(cmd) ? cmd : [cmd];
        const [mainCmd, ...aliases] = cmdList;
        
        // 修改命令创建
        const command: Command = {
            cmd: mainCmd,
            desc,
            fn: descriptor.value,
            aliases,
            cmdPrefix: CMD_PREFIX,
            pluginId: pluginId,
            class: target.constructor,
            template: {
                enabled: false,
                sendText: true
            }
        };
        
        plugin.commands.push(command);
        botlogger.info(`注册命令[${pluginId}]: ${CMD_PREFIX}${pluginId} ${mainCmd}`);
        
        return descriptor;
    };
}

// 添加参数元数据接口
interface ParamMetadata {
    name: string;
    type: ParamType;
    optional: boolean;
    index: number;
}

// 修改参数解析函数
async function parseCommandParams(message: string, context: MessageContext): Promise<any[]> {
    const cmdArgs = message.split(/\s+/).filter(Boolean);
    
    // 移除命令前缀和命令名
    const cmdPrefix = '#';
    const parts = message.split(/\s+/);
    const paramArgs = parts.slice(2); // 跳过 #test param 这两个部分

    // 调试日志
    botlogger.info('DEBUG - 命令参数:', JSON.stringify({
        message,
        cmdArgs,
        paramArgs,
        parts
    }));

    const params: any[] = [];
    
    // 添加参数
    if (paramArgs.length > 0) {
        // 第一个参数作为字符串
        params.push(paramArgs[0]);
        
        // 第二个参数尝试转换为数字
        if (paramArgs.length > 1) {
            const num = Number(paramArgs[1]);
            if (!isNaN(num)) {
                params.push(num);
            }
        }
    }

    // 添加 context 参数
    params.push(context);

    // 调试日志
    botlogger.info('DEBUG - 最终参数:', JSON.stringify({
        params: params.slice(0, -1), // 不显示 context
        paramCount: params.length,
        paramArgs
    }));

    return params;
}
