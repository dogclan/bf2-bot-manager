import fs from 'fs';
import glob from 'glob';
import { promisify } from 'util';
import { BflistPlayer } from './http/typing';
import { TeamSizes } from './typing';

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

export function getStatusCheckURL(ip: string, port: number): string {
    return `https://api.bflist.io/bf2/v1/servers/${ip}:${port}`;
}

export function getBotName(basename: string, currentName?: string): string {
    const numbers = Array.from({ length: 16 }, (x, i) => i);

    if (currentName) {
        const currentNumber = Number(currentName.split('^').pop());
        const index = numbers.indexOf(currentNumber);
        numbers.splice(index, 1);
    }

    const newNumber = numbers[Math.floor(Math.random() * numbers.length)];

    return `${basename}^${Number(newNumber).toString(16)}`;
}

export function getTeamSizes(players: BflistPlayer[]): TeamSizes {
    const teamSizes = [
        players.filter((b: BflistPlayer) => b.team == 1).length,
        players.filter((b: BflistPlayer) => b.team == 2).length
    ];
    const smaller = Math.min(...teamSizes);
    const bigger = Math.max(...teamSizes);

    return {
        smaller,
        bigger,
        delta: bigger - smaller
    };
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

    // Pick characters randomly
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
