import { Logger, TLogLevelName } from 'tslog';
import Config from './config';

const logger: Logger = new Logger({
    name: 'MainLogger',
    minLevel: Config.LOG_LEVEL as TLogLevelName,
    displayFunctionName: false
});

export default logger;
