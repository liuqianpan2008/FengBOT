import fs from 'fs';
import yaml from 'yaml';
import minimist from 'minimist';
import path from 'path';

// 获取环境变量参数
const args = minimist(process.argv.slice(2));
const configsPath = (args['configPath'] || args['c']) ?? __dirname +'/../config';
for (let i = 2; i < process.argv.length; i++) {
    console.log(`参数 ${i - 2}: ${process.argv[i]}`);
}

function cofigfilePath(fileName:string):string {
    return path.join(configsPath,fileName)
}

// 定义类别参数
interface botConfig {
    baseUrl: string;
    accessToken: string;
    DEBUG:boolean,
    cmd:string
}
//返回获取的方法参数
export const readConfigBot = (): botConfig => {
  const data = fs.readFileSync(cofigfilePath('bot.yaml'), 'utf8');
  return yaml.parse(data).bot as botConfig;
};