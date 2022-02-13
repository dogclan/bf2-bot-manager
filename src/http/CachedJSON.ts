import moment, { Moment } from 'moment';
import { jsonParseAsync } from '../utility';

class CachedJSON {
    public data: any;
    public asOf: Moment;

    constructor(data: any, asOf?: string) {
        this.data = data;
        this.asOf = moment(asOf);
    }

    public stringify(replacer?: { (key: string, value: any): any }): string {
        return JSON.stringify(
            {
                data: this.data,
                asOf: this.asOf
            },
            replacer
        );
    }

    public static async parse(unparsed: string): Promise<CachedJSON> {
        const parsed = await jsonParseAsync(unparsed);
        return new this(parsed.data, parsed.asOf);
    }
}

export default CachedJSON;
