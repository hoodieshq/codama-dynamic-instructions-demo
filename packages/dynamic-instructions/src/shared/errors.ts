export class DynamicInstructionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DynamicInstructionsError';
    }
}

export class ValidationError extends DynamicInstructionsError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class AccountError extends DynamicInstructionsError {
    constructor(message: string) {
        super(message);
        this.name = 'AccountError';
    }
}

export class ArgumentError extends DynamicInstructionsError {
    constructor(message: string) {
        super(message);
        this.name = 'ArgumentError';
    }
}
