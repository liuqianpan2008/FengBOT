import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import botlogger from './logger';
import { Plugin } from './decorators';
import { MessageContext } from './plugins';

interface PluginStates {
    plugins: {
        globalDisabled: string[];
        groupDisabled: { [groupId: string]: string[] };
        userDisabled: { [userId: string]: string[] };
    };
}

export class PluginManager {
    private static plugins: Plugin[] = [];
    private static statesConfigPath = path.join(__dirname, '..', 'config', 'plugin-states.yaml');
    private static states: PluginStates;

    public static async init(): Promise<void> {
        this.plugins = [];
        await this.loadStates();
    }

    private static async loadStates(): Promise<void> {
        try {
            if (!fs.existsSync(this.statesConfigPath)) {
                // 创建默认配置
                this.states = {
                    plugins: {
                        globalDisabled: [],
                        groupDisabled: {},
                        userDisabled: {}
                    }
                };
                await this.saveStates();
            } else {
                const content = fs.readFileSync(this.statesConfigPath, 'utf8');
                this.states = yaml.load(content) as PluginStates;
            }
            botlogger.info('加载插件状态配置成功');
        } catch (error) {
            botlogger.error('加载插件状态配置失败:', error);
            throw error;
        }
    }

    private static async saveStates(): Promise<void> {
        try {
            const content = yaml.dump(this.states);
            fs.writeFileSync(this.statesConfigPath, content, 'utf8');
            botlogger.info('保存插件状态配置成功');
        } catch (error) {
            botlogger.error('保存插件状态配置失败:', error);
            throw error;
        }
    }

    public static registerPlugin(plugin: Plugin): void {
        this.plugins.push(plugin);
    }

    public static getPlugins(): Plugin[] {
        return this.plugins;
    }

    public static async enablePlugin(pluginId: string, context?: { type: 'global' | 'group' | 'user', id?: string }): Promise<void> {
        await this.loadStates();
        
        if (!context || context.type === 'global') {
            this.states.plugins.globalDisabled = this.states.plugins.globalDisabled.filter(id => id !== pluginId);
        } else if (context.type === 'group' && context.id) {
            const groupDisabled = this.states.plugins.groupDisabled[context.id] || [];
            this.states.plugins.groupDisabled[context.id] = groupDisabled.filter(id => id !== pluginId);
        } else if (context.type === 'user' && context.id) {
            const userDisabled = this.states.plugins.userDisabled[context.id] || [];
            this.states.plugins.userDisabled[context.id] = userDisabled.filter(id => id !== pluginId);
        }

        await this.saveStates();
    }

    public static async disablePlugin(pluginId: string, context?: { type: 'global' | 'group' | 'user', id?: string }): Promise<void> {
        await this.loadStates();

        if (!context || context.type === 'global') {
            if (!this.states.plugins.globalDisabled.includes(pluginId)) {
                this.states.plugins.globalDisabled.push(pluginId);
            }
        } else if (context.type === 'group' && context.id) {
            if (!this.states.plugins.groupDisabled[context.id]) {
                this.states.plugins.groupDisabled[context.id] = [];
            }
            if (!this.states.plugins.groupDisabled[context.id].includes(pluginId)) {
                this.states.plugins.groupDisabled[context.id].push(pluginId);
            }
        } else if (context.type === 'user' && context.id) {
            if (!this.states.plugins.userDisabled[context.id]) {
                this.states.plugins.userDisabled[context.id] = [];
            }
            if (!this.states.plugins.userDisabled[context.id].includes(pluginId)) {
                this.states.plugins.userDisabled[context.id].push(pluginId);
            }
        }

        await this.saveStates();
    }

    public static async isPluginEnabled(pluginId: string, context?: { type: 'group' | 'user', id: string }): Promise<boolean> {
        await this.loadStates();

        // 检查全局禁用
        if (this.states.plugins.globalDisabled.includes(pluginId)) {
            return false;
        }

        // 检查特定上下文
        if (context) {
            if (context.type === 'group') {
                const groupDisabled = this.states.plugins.groupDisabled[context.id] || [];
                if (groupDisabled.includes(pluginId)) {
                    return false;
                }
            } else if (context.type === 'user') {
                const userDisabled = this.states.plugins.userDisabled[context.id] || [];
                if (userDisabled.includes(pluginId)) {
                    return false;
                }
            }
        }

        return true;
    }

    public static async checkPluginEnabled(pluginId: string, context: MessageContext): Promise<boolean> {
        const checkContext = context.message_type === 'group' && context.group_id
            ? { type: 'group' as const, id: String(context.group_id) }
            : { type: 'user' as const, id: String(context.user_id) };

        const isEnabled = await this.isPluginEnabled(pluginId, checkContext);
        if (!isEnabled) {
            botlogger.info(`插件 ${pluginId} 已被禁用`);
            return false;
        }
        return true;
    }
} 