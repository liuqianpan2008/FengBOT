import { runcod, plugins, permission, PermissionLevel, coins, param, ParamType } from "../lib/decorators";
import { MessageContext } from "../lib/plugins";
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import botlogger from '../lib/logger';
import { economy } from '../lib/economy';
import { schedule } from "../lib/decorators";

// 用户数据接口
interface UserData {
    userId: string;
    nickname: string;
    exp: number;
    level: number;
    title: string;
    lastSignTime?: number;
    signCount: number;
    continuousSignDays: number;    
    totalSignDays: number;         
    monthlySignDays: number;       
    lastMonthSignTime?: number;    
    reminderEnabled: boolean;
    makeupCount: number;          
    lastMakeupTime?: number;
    coins?: number;
}

// 签到配置接口
interface SignConfig {
    baseCoins: number;
    baseExp: number;
    continuousBonus: {
        coins: number;
        exp: number;
    };
    levels: {
        [key: string]: {
            exp: number;
            title: string;
        };
    };
}

// 添加一个新的接口用于格式化后的数据
interface FormattedUserData extends UserData {
    coins?: number;
    nextLevelExp?: number;
    expProgress?: number;
    expPercentage?: string;
    todayCoins?: number;
    todayExp?: number;
}

@plugins({
    id: "sign",
    name: "签到系统",
    version: "1.0.0",
    describe: "签到获取金币和经验",
    author: "枫叶秋林",
    help: {
        enabled: true,
        description: "签到相关功能",
    }
})
export class Sign {
    private userDataPath = path.join(__dirname, '..', 'data', 'users.yaml');
    private configPath = path.join(__dirname, '..', 'config', 'sign.yaml');
    private userData: { [key: string]: UserData } = {};
    private config!: SignConfig;

    constructor() {
        this.loadConfig();
        this.loadUserData();
    }

    // 加载配置
    private loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                // 创建默认配置
                const defaultConfig: SignConfig = {
                    baseCoins: 10,
                    baseExp: 5,
                    continuousBonus: {
                        coins: 5,
                        exp: 2
                    },
                    levels: {
                        '1': { exp: 0, title: "新手" },
                        '2': { exp: 100, title: "初级" },
                        '3': { exp: 300, title: "中级" },
                        '4': { exp: 600, title: "高级" },
                        '5': { exp: 1000, title: "专家" },
                        '6': { exp: 2000, title: "大师" },
                        '7': { exp: 3500, title: "宗师" },
                        '8': { exp: 5000, title: "传说" },
                        '9': { exp: 8000, title: "神话" },
                        '10': { exp: 12000, title: "至尊" }
                    }
                };
                
                // 确保配置目录存在
                const dir = path.dirname(this.configPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // 保存默认配置
                fs.writeFileSync(this.configPath, yaml.dump(defaultConfig));
                this.config = defaultConfig;
            } else {
                // 加载现有配置
                this.config = yaml.load(fs.readFileSync(this.configPath, 'utf8')) as SignConfig;
            }
        } catch (error) {
            botlogger.error('加载签到配置失败:', error);
            throw error;
        }
    }

    // 保存配置
    private saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, yaml.dump(this.config));
        } catch (error) {
            botlogger.error('保存签到配置失败:', error);
            throw error;
        }
    }

    // 加载用户数据
    private loadUserData() {
        try {
            if (fs.existsSync(this.userDataPath)) {
                const data = yaml.load(fs.readFileSync(this.userDataPath, 'utf8'));
                // 确保加载的数据是对象
                this.userData = (typeof data === 'object' && data !== null) ? data as { [key: string]: UserData } : {};
            } else {
                this.userData = {};
            }
        } catch (error) {
            botlogger.error('加载用户数据失败:', error);
            this.userData = {};  // 确保即使加载失败也有一个有效的对象
        }
    }

    // 保存用户数据
    private saveUserData() {
        try {
            // 清理无效数据
            const cleanedUserData = Object.entries(this.userData)
                .filter(([key, user]) => {
                    return key 
                        && key !== 'undefined' 
                        && key !== ''
                        && user
                        && user.userId
                        && user.userId !== ''
                        && user.userId !== 'undefined';
                })
                .reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {} as typeof this.userData);

            this.userData = cleanedUserData;

            const dir = path.dirname(this.userDataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.userDataPath, yaml.dump(this.userData));
        } catch (error) {
            botlogger.error('保存用户数据失败:', error);
            throw error;
        }
    }

    // 获取用户数据
    private getUserData(userId: string, nickname: string): UserData {
        // 确保 userId 有效
        if (!userId || userId === 'undefined' || userId === '') {
            throw new Error('Invalid userId');
        }

        // 确保 userData 对象已初始化
        if (!this.userData) {
            this.userData = {};
        }

        // 如果用户数据不存在，创建新用户数据
        if (!this.userData[userId]) {
            this.userData[userId] = {
                userId,
                nickname: nickname || String(userId),
                exp: 0,
                level: 1,
                title: this.config.levels['1'].title,
                signCount: 0,
                continuousSignDays: 0,
                totalSignDays: 0,
                monthlySignDays: 0,
                reminderEnabled: false,
                makeupCount: 0,
                lastSignTime: 0,
                lastMonthSignTime: 0,
                lastMakeupTime: 0
            };
            this.saveUserData();
        } else {
            // 确保现有数据包含所有必要字段
            const defaultData = {
                userId,
                nickname: nickname || String(userId),
                exp: 0,
                level: 1,
                title: this.config.levels['1'].title,
                signCount: 0,
                continuousSignDays: 0,
                totalSignDays: 0,
                monthlySignDays: 0,
                reminderEnabled: false,
                makeupCount: 0,
                lastSignTime: 0,
                lastMonthSignTime: 0,
                lastMakeupTime: 0
            };

            // 使用默认值补充缺失的字段
            this.userData[userId] = {
                ...defaultData,
                ...this.userData[userId]
            };
        }

        return this.userData[userId];
    }

    // 检查并更新等级
    private checkLevelUp(userData: UserData): boolean {
        const levels = Object.entries(this.config.levels)
            .sort((a, b) => Number(b[0]) - Number(a[0]));
        
        for (const [level, data] of levels) {
            if (userData.exp >= data.exp && Number(level) > userData.level) {
                userData.level = Number(level);
                userData.title = data.title;
                return true;
            }
        }
        return false;
    }

    // 获取下一级所需经验
    private getNextLevelExp(currentLevel: number): number {
        const levels = Object.entries(this.config.levels)
            .sort((a, b) => Number(a[0]) - Number(b[0]));
        
        for (const [level, data] of levels) {
            if (Number(level) > currentLevel) {
                return data.exp;
            }
        }
        return -1; // 已达到最高等级
    }

    // 格式化用户数据用于显示
    private formatUserData(userData: FormattedUserData): any {
        const nextLevelExp = this.getNextLevelExp(userData.level);
        return {
            ...userData,
            nextLevelExp,
            expProgress: nextLevelExp > 0 ? userData.exp - this.config.levels[userData.level].exp : 0,
            expPercentage: nextLevelExp > 0 
                ? ((userData.exp - this.config.levels[userData.level].exp) / 
                   (nextLevelExp - this.config.levels[userData.level].exp) * 100).toFixed(1)
                : "100"
        };
    }

    private resetMonthlyStats(userData: UserData) {
        const now = new Date();
        const lastMonth = userData.lastMonthSignTime ? new Date(userData.lastMonthSignTime).getMonth() : -1;
        
        if (lastMonth !== now.getMonth()) {
            userData.monthlySignDays = 0;
            userData.lastMonthSignTime = now.getTime();
        }
    }

    private updateSignStats(userData: UserData) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;

        // 检查连续签到
        if (userData.lastSignTime && userData.lastSignTime >= yesterday) {
            userData.continuousSignDays++;
        } else {
            userData.continuousSignDays = 1;
        }

        // 更新总签到天数
        userData.totalSignDays = (userData.totalSignDays || 0) + 1;

        // 更新月度签到
        this.resetMonthlyStats(userData);
        userData.monthlySignDays++;
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["sign", "签到"], "每日签到")
    async sign(context: MessageContext): Promise<any> {
        try {
            const userId = context.user_id;
            const nickname = context.sender?.nickname || String(userId);
            
            if (!userId) {
                return {
                    title: "签到失败",
                    message: "无效的用户ID",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            const userData = this.getUserData(userId, nickname);
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            // 检查是否已经签到
            if (userData.lastSignTime && userData.lastSignTime >= today) {
                return {
                    title: "签到失败",
                    message: "今天已经签到过了",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            // 更新签到统计
            this.updateSignStats(userData);
            
            // 计算奖励
            const coins = this.config.baseCoins + (userData.continuousSignDays * this.config.continuousBonus.coins);
            const exp = this.config.baseExp + (userData.continuousSignDays * this.config.continuousBonus.exp);
            
            // 使用 economy 增加金币
            economy.addCoins(userId, coins, "签到奖励");
            
            // 更新经验和其他数据
            userData.exp += exp;
            userData.lastSignTime = now.getTime();
            userData.signCount++;
            
            // 检查等级提升
            this.checkLevelUp(userData);
            
            this.saveUserData();

            // 获取最新金币数
            const currentCoins = economy.getCoins(userId, "查询余额");

            return {
                title: "签到成功",
                message: "签到成功！",
                info: {
                    ...userData,
                    coins: currentCoins,
                    todayCoins: coins,
                    todayExp: exp
                },
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'result.html')
                }
            };
        } catch (error) {
            botlogger.error('签到失败:', error);
            return {
                title: "签到失败",
                message: "签到失败",
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                }
            };
        }
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["rank", "排行"], "查看排行榜")
    async rank(context: MessageContext, type: string = "exp"): Promise<any> {
        try {
            // 初始化用户数据
            if (!this.userData) {
                this.loadUserData();
            }

            // 获取所有用户数据,只过滤掉无效的key
            const validUsers = Object.entries(this.userData)
                .filter(([key]) => key && typeof key === 'string')
                .map(([key, user]) => ({
                    ...user,
                    coins: economy.getCoins(key, "查询余额") 
                }));

            if (validUsers.length === 0) {
                return {
                    title: "暂无排行",
                    message: "目前还没有任何记录",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            let rankType = "exp";
            let sortedUsers = [];

            // 根据类型排序
            switch (type) {
                case "coin":
                case "金币":
                    rankType = "coin";
                    sortedUsers = validUsers.sort((a, b) => b.coins - a.coins);
                    break;
                case "sign":
                case "签到":
                    rankType = "sign"; 
                    sortedUsers = validUsers.sort((a, b) => b.totalSignDays - a.totalSignDays);
                    break;
                case "continuous":
                case "连续":
                    rankType = "continuous";
                    sortedUsers = validUsers.sort((a, b) => b.continuousSignDays - a.continuousSignDays);
                    break;
                default:
                    sortedUsers = validUsers.sort((a, b) => b.exp - a.exp);
                    break;
            }

            // 只取前10名
            const topUsers = sortedUsers.slice(0, 10);

            return {
                title: "排行榜",
                message: `${type}排行榜`, 
                users: topUsers,
                rankType,
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'rank.html')
                }
            };

        } catch (error) {
            botlogger.error('获取排行榜失败:', error);
            return {
                title: "获取失败", 
                message: "获取排行榜失败",
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                }
            };
        }
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["info", "查询"], "查看个人信息")
    async info(context: MessageContext): Promise<any> {
        try {
            const userId = context.user_id;
            const nickname = context.sender?.nickname || String(userId);
            
            if (!userId) {
                return {
                    title: "查询失败",
                    message: "无效的用户ID",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            const userData = this.getUserData(userId, nickname);
            const currentCoins = economy.getCoins(userId, "查询信息");
            
            const formattedData = this.formatUserData({
                ...userData,
                coins: currentCoins
            } as FormattedUserData);

            return {
                title: "个人信息",
                message: `${userData.nickname} 的个人信息`,
                info: formattedData,
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'info.html')
                }
            };
        } catch (error) {
            botlogger.error('查询个人信息失败:', error);
            return {
                title: "查询失败",
                message: "查询个人信息失败",
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                }
            };
        }
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["stats", "统计"], "查看签到统计")
    async stats(context: MessageContext): Promise<any> {
        try {
            const userId = context.user_id;
            const nickname = context.sender?.nickname || String(userId);
            
            if (!userId) {
                return {
                    title: "统计失败",
                    message: "无效的用户ID",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            const userData = this.getUserData(userId, nickname);
            
            if (!userData) {
                return {
                    title: "统计失败",
                    message: "获取用户数据失败",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            // 计算签到率
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const signRate = (userData.monthlySignDays / daysInMonth * 100).toFixed(1);

            return {
                title: "签到统计",
                message: `${userData.nickname} 的签到统计信息`,
                stats: {
                    ...userData,
                    signRate,
                    daysInMonth,
                    remainingDays: daysInMonth - now.getDate() + 1
                },
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'stats.html')
                }
            };
        } catch (error) {
            botlogger.error('查询签到统计失败:', error);
            return {
                title: "统计失败",
                message: "查询签到统计失败",
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                }
            };
        }
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["makeup", "补签"], "补签一次")
    @coins(-50, "补签消耗")
    async makeupSign(context: MessageContext): Promise<any> {
        try {
            const userId = context.user_id;
            const nickname = context.sender?.nickname || String(userId);
            
            if (!userId) {
                return {
                    title: "补签失败",
                    message: "无效的用户ID",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            // 检查补签次数限制
            const userData = this.getUserData(userId, nickname);
            if (userData.makeupCount >= 3) {  // 添加补签次数限制
                return {
                    title: "补签失败",
                    message: "本月补签次数已用完(每月3次)",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            
            if (userData.lastSignTime && userData.lastSignTime >= today) {
                return {
                    title: "补签失败",
                    message: "今天已经签到过了",
                    template: {
                        enabled: true,
                        path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                    }
                };
            }

            // 更新签到统计
            this.updateSignStats(userData);
            
            // 补签只给基础奖励
            const coins = this.config.baseCoins;
            economy.addCoins(userId, coins, "补签奖励");
            userData.exp += this.config.baseExp;
            userData.lastSignTime = now.getTime() - 86400000; // 设置为昨天
            userData.signCount++;
            userData.makeupCount++;
            userData.lastMakeupTime = now.getTime();
            
            this.saveUserData();

            return {
                title: "补签成功",
                message: "补签成功！",
                info: {
                    ...userData,
                    coins: economy.getCoins(userId, "查询余额"),
                    todayCoins: coins,
                    todayExp: this.config.baseExp
                },
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'result.html')
                }
            };
        } catch (error) {
            botlogger.error('补签失败:', error);
            return {
                title: "补签失败",
                message: "补签失败",
                template: {
                    enabled: true,
                    path: path.resolve(__dirname, '..', 'resources', 'sign', 'error.html')
                }
            };
        }
    }

    private validateUserData(user: UserData | undefined): boolean {
        if (!user) return false;
        
        // 检查必需字段是否存在且有效
        const hasValidId = typeof user.userId === 'string' 
            && user.userId.length > 0;
        
        const hasValidNickname = typeof user.nickname === 'string' 
            && user.nickname.length > 0;
        
        const hasValidNumbers = typeof user.exp === 'number'
            && typeof user.totalSignDays === 'number'
            && typeof user.continuousSignDays === 'number'
            && typeof user.level === 'number'
            && user.level >= 0;  // 改为 >= 0
        
        return hasValidId 
            && hasValidNickname 
            && hasValidNumbers;
    }
} 