import fs from 'fs';
import glob from 'glob';
import { promisify } from 'util';

export const globAsync = promisify(glob.glob);
export const mkdirAsync = promisify(fs.mkdir);
export const linkAsync = promisify(fs.link);
export const readFileAsync = promisify(fs.readFile);
export const writeFileAsync = promisify(fs.writeFile);

export function jsonParseAsync(jsonString: string): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            resolve(JSON.parse(jsonString));
        } catch (e) {
            reject(e);
        }
    });
}

export function generateCdkey(): string {
    const elements = [];
    for (let i = 0; i < 5; i++) {
        elements.push(randomString(4));
    }

    return elements.join('-');
}

export function getBotName(basename: string, currentName?: string): string {
    const numbers = [34, 42, 69, 101, 322, 404, 419, 420, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

    if (currentName) {
        const currentNumber = Number(currentName.split('^').pop());
        const index = numbers.indexOf(currentNumber);
        numbers.splice(index, 1);
    }

    const newNumber = numbers[Math.floor(Math.random() * numbers.length)];

    return `${basename}^${newNumber}`;
}

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
export function randomNumber(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

export function randomString(length: number): string {  
    // Declare all characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    // Pick characers randomly
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return str;
}

export function sleep(ms: number, val?: any): Promise<any> {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(val);
        }, ms);
    });
}

export function booleanToEnglish(bool?: boolean): string {
    return bool ? 'yes' : 'no';
}
