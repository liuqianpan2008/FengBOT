import puppeteer, { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import * as art from 'art-template';
import * as fs from 'fs';
import botlogger from './logger';

export class HtmlImg {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            const options: PuppeteerLaunchOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            };
            this.browser = await puppeteer.launch(options);
        }
    }

    async render(options: {
        template: string;
        data: any;
        width?: number;
        height?: number;
        type?: string;
        quality?: number;
        fullPage?: boolean;
        background?: boolean;
    }) {
        try {
            await this.init();
            
            const {
                template,
                data,
                width = 800,
                height = 600,
                type = 'png',
                quality = 100,
                fullPage = false,
                background = true
            } = options;

            // 读取模板
            const templateContent = fs.readFileSync(template, 'utf-8');
            
            // 渲染HTML
            const html = art.render(templateContent, data);

            // 创建页面
            const page = await this.browser!.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'networkidle0' });

            // 截图
            const image = await page.screenshot({
                type: type as 'png' | 'jpeg',
                quality: type === 'jpeg' ? quality : undefined,
                fullPage,
                omitBackground: !background
            });

            await page.close();
            return image;

        } catch (error) {
            botlogger.error('渲染图片失败:', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}