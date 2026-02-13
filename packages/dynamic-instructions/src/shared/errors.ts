export class CodamaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CodamaError';
    }
}

export class ValidationError extends CodamaError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class AccountError extends CodamaError {
    constructor(message: string) {
        super(message);
        this.name = 'AccountError';
    }
}

export class ArgumentError extends CodamaError {
    constructor(message: string) {
        super(message);
        this.name = 'ArgumentError';
    }
}
