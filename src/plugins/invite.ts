import {  plugins } from "../lib/decorators";
import { QQbot } from "../lib/plugins";
import path from 'path';
import botlogger from '../lib/logger';
import { MessageContext } from "../lib/plugins";

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
    describe: "处理群邀请",
    author: "枫叶秋林",
    help: {
        enabled: true,
        description: "群邀请相关功能",
    }
})
export class Invite {
    // 存储邀请信息
    private inviteMap = new Map<string, {
        inviter: string;
        time: Date;
    }>();

    // 修改消息处理方法
    async handleMessage(context: MessageContext): Promise<any> {
        try {
            // 检查消息是否为空
            if (!context.message || !Array.isArray(context.message) || context.message.length === 0) {
                return null;
            }

            // 检查是否是群邀请消息
            if (context.message_type === 'private') {
                // 遍历消息数组查找 json 类型消息
                for (const msg of context.message) {
                    if (msg?.type === 'json' && msg?.data?.data) {
                        try {
                            const data = JSON.parse(msg.data.data);
                            if (data?.app === 'com.tencent.qun.invite') {
                                // 处理群邀请逻辑
                                const groupCode = this.extractGroupCode(data);
                                if (groupCode) {
                                    botlogger.info('收到群邀请:', {groupCode});
                                    return await this.handleInvite(context, groupCode);
                                }
                            }
                        } catch (parseError) {
                            botlogger.error('解析JSON失败:', parseError);
                            continue;
                        }
                    }
                }
            }
            return null;
        } catch (error) {
            botlogger.error('处理群邀请失败:', error);
            return null;
        }
    }

    // 提取群号的辅助方法
    private extractGroupCode(data: any): string | null {
        try {
            if (data.meta && data.meta.news && data.meta.news.jumpUrl) {
                const match = data.meta.news.jumpUrl.match(/groupcode=(\d+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
            return null;
        } catch (error) {
            botlogger.error('提取群号失败:', error);
            return null;
        }
    }

    // 处理邀请的方法
    private async handleInvite(context: MessageContext, groupCode: string): Promise<any> {
        try {
            // 检查是否是机器人拥有者
        
            
            // 记录邀请信息
            this.inviteMap.set(groupCode, {
                inviter: String(context.user_id),
                time: new Date()
            });

            // 返回处理结果
            return {
                reply: `收到来自${context.sender?.nickname || context.user_id}的群${groupCode}邀请`
            };
        } catch (error) {
            botlogger.error('处理群邀请失败:', error);
            return {
                reply: "处理群邀请时发生错误"
            };
        }
    }

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