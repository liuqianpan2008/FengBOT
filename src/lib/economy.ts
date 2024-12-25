import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import botlogger from './logger';

// 用户数据接口
interface UserData {
    userId: string;
    nickname: string;
    coins: number;
}

export class Economy {
    private userDataPath = path.join(__dirname, '..', 'data', 'economy.yaml');
    private userData: { [key: string]: UserData } = {};

    constructor() {
        this.loadUserData();
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
            botlogger.error('加载经济数据失败:', error);
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
            botlogger.error('保存经济数据失败:', error);
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
                coins: 0
            };
            this.saveUserData();
        }

        return this.userData[userId];
    }

    // 扣除金币
    public deductCoins(userId: string, amount: number, reason: string): boolean {
        try {
            const userData = this.getUserData(userId, reason);
            if (userData.coins < amount) {
                return false;
            }
            userData.coins -= amount;
            this.saveUserData();
            return true;
        } catch (error) {
            botlogger.error('扣除金币失败:', error);
            return false;
        }
    }

    // 增加金币
    public addCoins(userId: string, amount: number, reason: string): boolean {
        try {
            const userData = this.getUserData(userId, reason);
            userData.coins += amount;
            this.saveUserData();
            return true;
        } catch (error) {
            botlogger.error('增加金币失败:', error);
            return false;
        }
    }

    // 获取金币余额
    public getCoins(userId: string, reason: string): number {
        try {
            const userData = this.getUserData(userId, reason);
            return userData.coins;
        } catch (error) {
            botlogger.error('获取金币余额失败:', error);
            return 0;
        }
    }
}

export const economy = new Economy(); 