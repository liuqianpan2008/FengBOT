import { runcod, plugins, param, ParamType, commandList, paramMetadata, session, sessions, SessionState, sessionMetadata, schedule, permission, PermissionLevel, SessionStep } from "../lib/decorators";
import { MessageContext } from "../lib/plugins";
import path from 'path';
import 'reflect-metadata';

// 添加会话状态接口
interface ChatSessionState {
    step: number;
    name?: string;
    age?: number;
    hobby?: string;
}

// 定义会话步骤
const chatSteps: SessionStep[] = [
    {
        prompt: "请输入你的名字",
        param: "name",
        type: "string"
    },
    {
        prompt: "请输入你的年龄",
        param: "age",
        type: "number"
    },
    {
        prompt: "请输入你的爱好",
        param: "hobby",
        type: "string"
    }
];

@plugins({
    id: "test",
    name: "测试插件",
    version: "1.0.0",
    describe: "测试功能",
    author: "枫叶秋林",
    help: {
        enabled: true,
        description: "显示帮助信息"
    }
})
export class Test {
    @permission(PermissionLevel.EVERYONE)
    @runcod(["param"], "参数实例")
    async param(
        @param("参数1", ParamType.String) param1: string,
        @param("参数2", ParamType.Number) param2: number,
        context: MessageContext
    ): Promise<any> {
        if (!param1 || !param2) {
            return "请输入正确的参数格式: #test param <字符串> <数字>";
        }

        // 返回带模板的响应
        return {
            title: "参数测试",
            message: "参数解析结果",
            param1,
            param2,
            template: {
                enabled: true,
                sendText: false,
                path: path.resolve(__dirname, '..', 'resources', 'test', 'param.html'),
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
                titleColor: '#1890ff',
                textColor: '#333333',
                paramColor: '#666666',
                borderColor: '#e8e8e8'
            },
            toString() {
                return `参数1(字符串): ${param1}\n参数2(数字): ${param2}`;
            }
        };
    }

    @permission(PermissionLevel.EVERYONE)
    @runcod(["chat"], "连续对话测试")
    @session({
        timeout: 30000,
        steps: [
            {
                prompt: "请输入你的名字",
                param: "name",
                type: "string"
            },
            {
                prompt: "请输入你的年龄",
                param: "age", 
                type: "number"
            },
            {
                prompt: "请输入你的爱好",
                param: "hobby",
                type: "string"
            }
        ]
    })
    async chat(
        context: MessageContext,
        state: SessionState
    ): Promise<string> {
        // 检查消息格式
        if(!context?.message?.length || !context.message[0]?.data?.text) {
            return "消息格式错误";
        }

        const messageText = context.message[0].data.text;

        // 如果是命令触发,返回空字符串让装饰器处理
        if(messageText.startsWith('#')) {
            return "";
        }

        // 确保 state.data 存在
        state.data = state.data || {};

        // 根据当前步骤处理输入
        switch(state.step) {
            case 0:
                // 保存名字
                if(!messageText || messageText.length === 0) {
                    return "名字不能为空!";
                }
                state.data.name = messageText;
                return `${state.data.name},请输入你的年龄`;
                
            case 1:
                // 保存年龄
                const age = Number(messageText);
                if(isNaN(age) || age <= 0) {
                    return "请输入有效的年龄!";
                }
                state.data.age = age;
                return "请输入你的爱好";

            case 2:
                // 保存爱好
                if(!messageText || messageText.length === 0) {
                    return "爱好不能为空!";
                }
                state.data.hobby = messageText;
                
                // 返回最终结果
                return `名字: ${state.data.name}\n年龄: ${state.data.age}\n爱好: ${state.data.hobby}`;
        }

        return "会话已结束";
    }
}
