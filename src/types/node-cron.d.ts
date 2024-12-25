declare module 'node-cron' {
    interface ScheduleOptions {
        scheduled?: boolean;
        timezone?: string;
    }

    interface ScheduledTask {
        start: () => void;
        stop: () => void;
        destroy: () => void;
    }

    export function schedule(
        expression: string,
        func: () => void,
        options?: ScheduleOptions
    ): ScheduledTask;

    export function validate(expression: string): boolean;
} 