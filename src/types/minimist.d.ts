declare module 'minimist' {
    function minimist(args: string[], opts?: minimist.Opts): minimist.ParsedArgs;
    
    namespace minimist {
        interface Opts {
            string?: string | string[];
            boolean?: boolean | string | string[];
            alias?: { [key: string]: string | string[] };
            default?: { [key: string]: any };
            stopEarly?: boolean;
            '--'?: boolean;
            unknown?: (arg: string) => boolean;
        }

        interface ParsedArgs {
            [key: string]: any;
            _: string[];
        }
    }

    export = minimist;
}
  