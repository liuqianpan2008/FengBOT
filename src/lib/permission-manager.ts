import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PermissionLevel } from './decorators';
import botlogger from './logger';
import { MessageContext } from './plugins';

interface PermissionConfig {
    owner: string;
    superAdmins: string[];
    admins: string[];
    users: string[];
    blacklist: string[];
    defaultLevel: number;
}

interface BotConfig {
    bot: {
        baseUrl: string;
        accessToken: string;
        DEBUG: boolean;
        cmd: string;
    };
    permissions: PermissionConfig;
}

// 添加权限元数据接口
interface PermissionMetadata {
    level: PermissionLevel;
    customCheck?: (userId: string, context: MessageContext) => Promise<boolean>;
}

export class PermissionManager {
    private static instance: PermissionManager;
    private config!: PermissionConfig;
    private configPath: string;
    private botConfigPath: string;

    private constructor() {
        this.configPath = path.join(__dirname, '..', 'config', 'permissions.json');
        this.botConfigPath = path.join(__dirname, '..', 'config', 'bot.yaml');
        this.loadConfig();
    }

    public static getInstance(): PermissionManager {
        if (!PermissionManager.instance) {
            PermissionManager.instance = new PermissionManager();
        }
        return PermissionManager.instance;
    }

    private loadConfig(): void {
        try {
            // 首先尝试从 bot.yaml 加载
            if (fs.existsSync(this.botConfigPath)) {
                const configContent = fs.readFileSync(this.botConfigPath, 'utf8');
                const botConfig = yaml.load(configContent) as BotConfig;
                
                if (botConfig?.permissions) {
                    this.config = {
                        owner: botConfig.permissions.owner || '',
                        superAdmins: Array.isArray(botConfig.permissions.superAdmins) ? botConfig.permissions.superAdmins : [],
                        admins: Array.isArray(botConfig.permissions.admins) ? botConfig.permissions.admins : [],
                        users: Array.isArray(botConfig.permissions.users) ? botConfig.permissions.users : [],
                        blacklist: Array.isArray(botConfig.permissions.blacklist) ? botConfig.permissions.blacklist : [],
                        defaultLevel: typeof botConfig.permissions.defaultLevel === 'number' ? botConfig.permissions.defaultLevel : 0
                    };
                    botlogger.info('从 bot.yaml 加载权限配置成功');
                    return;
                }
            }

            // 如果 bot.yaml 中没有权限配置，尝试从 permissions.json 加载
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const loadedConfig = JSON.parse(configData) as PermissionConfig;
                this.config = {
                    owner: loadedConfig.owner || '',
                    superAdmins: Array.isArray(loadedConfig.superAdmins) ? loadedConfig.superAdmins : [],
                    admins: Array.isArray(loadedConfig.admins) ? loadedConfig.admins : [],
                    users: Array.isArray(loadedConfig.users) ? loadedConfig.users : [],
                    blacklist: Array.isArray(loadedConfig.blacklist) ? loadedConfig.blacklist : [],
                    defaultLevel: typeof loadedConfig.defaultLevel === 'number' ? loadedConfig.defaultLevel : 0
                };
                botlogger.info('从 permissions.json 加载权限配置成功');
            } else {
                // 使用默认配置
                this.config = {
                    owner: '',
                    superAdmins: [],
                    admins: [],
                    users: [],
                    blacklist: [],
                    defaultLevel: 0
                };
                botlogger.info('使用默认权限配置');
                this.saveConfig();
            }
        } catch (error) {
            botlogger.error('加载权限配置失败:', error);
            // 使用默认配置
            this.config = {
                owner: '',
                superAdmins: [],
                admins: [],
                users: [],
                blacklist: [],
                defaultLevel: 0
            };
            botlogger.info('使用默认权限配置（出错后）');
        }
    }

    private saveConfig(): void {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            botlogger.error('保存权限配置失败:', error);
            throw error;
        }
    }

    public async getUserLevel(userId: string): Promise<PermissionLevel> {
        // 确保 userId 是字符串类型
        const userIdStr = String(userId);
        
        const isOwner = userIdStr === this.config.owner;
        const isSuperAdmin = this.config.superAdmins.includes(userIdStr);
        const isAdmin = this.config.admins.includes(userIdStr);
        const isUser = this.config.users.includes(userIdStr);

        botlogger.info('获取用户权限 - 配置信息:'+JSON.stringify({
            userId: userIdStr,
            configOwner: this.config.owner,
            configSuperAdmins: this.config.superAdmins,
            configAdmins: this.config.admins,
            configUsers: this.config.users,
            isOwner,
            isSuperAdmin,
            isAdmin,
            isUser,
            ownerMatch: userIdStr === this.config.owner,
            superAdminMatch: this.config.superAdmins.includes(userIdStr),
            adminMatch: this.config.admins.includes(userIdStr),
            userMatch: this.config.users.includes(userIdStr),
            typeCheck: {
                userIdType: typeof userIdStr,
                configOwnerType: typeof this.config.owner,
                userIdValue: userIdStr,
                configOwnerValue: this.config.owner
            }
        }));

        // 检查黑名单
        if (this.config.blacklist.includes(userIdStr)) {
            botlogger.info('用户在黑名单中');
            return PermissionLevel.EVERYONE - 1;
        }

        // 检查机器人拥有者
        if (isOwner) {
            botlogger.info('用户是机器人拥有者');
            return PermissionLevel.OWNER;
        }

        // 检查超级管理员
        if (isSuperAdmin) {
            botlogger.info('用户是超级管理员');
            return PermissionLevel.SUPER_ADMIN;
        }

        // 检查管理员
        if (isAdmin) {
            botlogger.info('用户是管理员');
            return PermissionLevel.ADMIN;
        }

        // 检查普通用户
        if (isUser) {
            botlogger.info('用户是普通用户');
            return PermissionLevel.USER;
        }

        botlogger.info('用户使用默认权限等级');
        return this.config.defaultLevel as PermissionLevel;
    }

    // 修改权限检查逻辑
    public async hasPermission(userId: string, requiredLevel: PermissionLevel): Promise<boolean> {
        // 确保 userId 是字符串类型
        const userIdStr = String(userId);
        const userLevel = await this.getUserLevel(userIdStr);
        const isOwner = userIdStr === this.config.owner;
        const isSuperAdmin = this.config.superAdmins.includes(userIdStr);
        
        botlogger.info('权限检查 - 详细信息:', JSON.stringify({
            userId: userIdStr,
            userLevel: PermissionLevel[userLevel],
            userLevelValue: userLevel,
            requiredLevel: PermissionLevel[requiredLevel],
            requiredLevelValue: requiredLevel,
            isOwner,
            isSuperAdmin,
            configOwner: this.config.owner,
            configSuperAdmins: this.config.superAdmins,
            typeCheck: {
                userIdType: typeof userIdStr,
                configOwnerType: typeof this.config.owner,
                userIdValue: userIdStr,
                configOwnerValue: this.config.owner
            }
        }));

        // 如果用户是黑名单用户，直接返回 false
        if (userLevel < PermissionLevel.EVERYONE) {
            botlogger.info('用户在黑名单中，拒绝访问');
            return false;
        }

        // 如果用户是机器人拥有者，拥有所有权限
        if (isOwner) {
            botlogger.info('用户是机器人拥有者，允许访问');
            return true;
        }

        // 如果用户是超级管理员，拥有除了 OWNER 之外的所有权限
        if (isSuperAdmin) {
            const hasPermission = requiredLevel !== PermissionLevel.OWNER;
            botlogger.info(`用户是超级管理员，${hasPermission ? '允许' : '拒绝'}访问`);
            return hasPermission;
        }

        // 使用数值比较，高级权限自动包含低级权限
        const hasPermission = (userLevel as number) >= (requiredLevel as number);
        botlogger.info(`权限等级比较: ${userLevel} >= ${requiredLevel} = ${hasPermission}`);
        return hasPermission;
    }

    // 修改权限检查函数
    public async setUserLevel(userId: string, level: PermissionLevel): Promise<void> {
        // 移除用户从所有列表
        this.config.superAdmins = this.config.superAdmins.filter(id => id !== userId);
        this.config.admins = this.config.admins.filter(id => id !== userId);
        this.config.users = this.config.users.filter(id => id !== userId);
        this.config.blacklist = this.config.blacklist.filter(id => id !== userId);

        // 添加到对应列表
        switch (level) {
            case PermissionLevel.OWNER:
                this.config.owner = userId;
                break;
            case PermissionLevel.SUPER_ADMIN:
                this.config.superAdmins.push(userId);
                break;
            case PermissionLevel.ADMIN:
                this.config.admins.push(userId);
                break;
            case PermissionLevel.USER:
                this.config.users.push(userId);
                break;
            case PermissionLevel.EVERYONE - 1:
                this.config.blacklist.push(userId);
                break;
        }

        this.saveConfig();
    }

    // 添加重新加载配置的方法
    public async reloadConfig(): Promise<void> {
        this.loadConfig();
    }
}

// 导出获取用户权限级别的函数
export async function getUserPermissionLevel(userId: string): Promise<PermissionLevel> {
    return await PermissionManager.getInstance().getUserLevel(userId);
}

// 修改权限检查函数
export async function checkPermission(userId: string, context: MessageContext, fn: Function): Promise<boolean> {
    const metadata: PermissionMetadata = Reflect.getMetadata('permission', fn);
    if (!metadata) return true; // 没有权限要求则默认允许

    const permManager = PermissionManager.getInstance();
    const hasRequiredLevel = await permManager.hasPermission(userId, metadata.level);

    // 如果没有所需权限等级，直接返回 false
    if (!hasRequiredLevel) {
        return false;
    }

    // 如果有自定义检查，执行自定义检查
    if (metadata.customCheck) {
        return await metadata.customCheck(userId, context);
    }

    return true;
} 