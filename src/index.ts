import BotManager from './BotManager';
import Config from './config';
import logger from './logger';

logger.info('Launching bot manager');
const manager = new BotManager(Config.TOKEN);
manager.launchBots();
