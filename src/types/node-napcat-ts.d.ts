declare module 'node-napcat-ts' {
    export class NCWebsocket {
        constructor(config: any, debug?: boolean);
        connect(): Promise<void>;
        on(event: string, listener: (msg: any) => void): void;
    }

    export namespace Structs {
        function image(path: string): any;
    }
} 