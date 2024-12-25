import { NCWebsocket } from "node-napcat-ts"
import { readConfigBot } from "./cofig"
import botlogger from "./logger"
import { EventEmitter } from 'events';

export class bot extends NCWebsocket {
    private eventEmitter: EventEmitter;

    constructor() {
        const ConfigBot = readConfigBot()
        super({
            baseUrl: ConfigBot.baseUrl,
            accessToken: ConfigBot.accessToken,
            throwPromise: true,
            reconnection: {
                enable: true,
                attempts: 10,
                delay: 5000
            }
        }, ConfigBot.DEBUG ?? false)
        
        this.eventEmitter = new EventEmitter();
        
        // 使用父类的 on 方法监听消息
        super.on('message', (msg: any) => {
            this.eventEmitter.emit('message', msg);
        });
    }

    on(event: string, listener: (...args: any[]) => void): this {
        this.eventEmitter.on(event, listener);
        return this;
    }

    async run() {
        await super.connect()
        botlogger.info("连接服务成功")
    }
}

