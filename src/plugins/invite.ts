import {  plugins } from "../lib/decorators";
import { QQbot } from "../lib/plugins";
import path from 'path';
import botlogger from '../lib/logger';

interface InviteResponse {
    inviter: string;
    group: string;
    time: string;
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
        textColor: string;
        highlightColor: string;
        infoColor: string;
    };
}

@plugins({
    id: "invite",
    name: "群邀请处理",
    version: "1.0.0",
    author: "Your Name",
    describe: "处理群邀请和入群事件",
    help: {
        enabled: true,
        description: "自动处理群邀请并发送欢迎消息"
    }
})
export class Invite {
    // 存储邀请信息
    private inviteMap = new Map<string, {
        inviter: string;
        time: Date;
    }>();

    // 处理群邀请事件
    async handleGroupInvite(event: any): Promise<void> {
        try {
            const { group_id, user_id, flag } = event;
            
            if (!flag) {
                botlogger.error('处理群邀请失败: 缺少 flag 参数');
                return;
            }

            // 自动同意邀请
            try {
                await QQbot.set_group_add_request({
                    flag,
                    approve: true
                });
                botlogger.info('自动同意群邀请成功:', {
                    group_id,
                    user_id,
                    flag
                });
            } catch (error) {
                botlogger.error('处理群邀请失败:', error);
                return;
            }

            // 记录邀请信息
            this.inviteMap.set(String(group_id), {
                inviter: String(user_id),
                time: new Date()
            });
            botlogger.info('记录群邀请信息:', {
                group_id,
                inviter: user_id
            });
        } catch (error) {
            botlogger.error('处理群邀请失败:', error);
        }
    }

    // 处理入群事件
    async handleGroupIncrease(event: any): Promise<void> {
        try {
            const { group_id, user_id } = event;
            const groupId = String(group_id);
            
            // 获取邀请信息
            const inviteInfo = this.inviteMap.get(groupId);
            if (!inviteInfo) return;

            // 生成欢迎消息
            const response: InviteResponse = {
                inviter: inviteInfo.inviter,
                group: groupId,
                time: inviteInfo.time.toLocaleString(),
                template: {
                    enabled: true,
                    sendText: false,
                    path: path.join(__dirname, '..', 'resources', 'invite', 'welcome.html'),
                    render: {
                        width: 800,
                        height: 400,
                        type: 'png',
                        quality: 100,
                        fullPage: false,
                        background: true
                    }
                },
                theme: {
                    backgroundColor: '#ffffff',
                    textColor: '#333333',
                    highlightColor: '#4CAF50',
                    infoColor: '#666666'
                }
            };

            // 发送欢迎消息
            await QQbot.send_group_msg({
                group_id: Number(group_id),
                message: [
                    {
                        type: 'at',
                        data: { qq: user_id }
                    },
                    {
                        type: 'text',
                        data: { text: ' 欢迎加入群聊！' }
                    }
                ]
            });

            // 发送邀请信息
            await QQbot.send_group_msg({
                group_id: Number(group_id),
                message: [
                    {
                        type: 'text',
                        data: { text: `邀请人: ${inviteInfo.inviter}\n邀请时间: ${inviteInfo.time.toLocaleString()}` }
                    }
                ]
            });

            // 清除邀请记录
            this.inviteMap.delete(groupId);
        } catch (error) {
            console.error('处理入群事件失败:', error);
        }
    }
} 