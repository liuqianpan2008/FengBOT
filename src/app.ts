import { loadplugins, QQbot } from './lib/plugins';
import botlogger from './lib/logger';

async function main() {
    try {
        // 加载插件
        botlogger.info("开始加载插件...");
        await loadplugins();
        botlogger.info("插件加载完成");

        // 启动机器人
        botlogger.info("正在启动机器人...");
        await QQbot.run();
        botlogger.info("机器人启动成功");
    } catch (error) {
        botlogger.error("启动失败:", error);
        process.exit(1);
    }
}

// 启动应用
main().catch(error => {
    botlogger.error("程序异常退出:", error);
    process.exit(1);
});

// 处理进程退出
process.on('SIGINT', () => {
    botlogger.info("正在关闭机器人...");
    QQbot.disconnect();
    process.exit(0);
});
