from dataclasses import dataclass
from typing import Optional, List


@dataclass
class BotConfig:
    basename: str
    password: str

    @staticmethod
    def load(data: dict) -> 'BotConfig':
        return BotConfig(
            basename=data.get('basename', str()),
            password=data.get('password', str())
        )

    def dump(self) -> dict:
        return {
            'basename': self.basename,
            'password': self.password
        }


@dataclass
class ServerConfig:
    name: str
    address: str
    port: int
    mod: str
    slots: int
    reserved_slots: int
    bots: List[BotConfig]
    query_port: Optional[int] = None
    autobalance: Optional[bool] = None
    query_directly: Optional[bool] = None
    rotate_bot_names: Optional[bool] = None

    @staticmethod
    def load(data: dict) -> 'ServerConfig':
        return ServerConfig(
            name=data.get('name', str()),
            address=data.get('address', str()),
            port=data.get('port', int()),
            mod=data.get('mod', str()),
            slots=data.get('slots', int()),
            reserved_slots=data.get('reservedSlots', int()),
            bots=[BotConfig.load(bot_config) for bot_config in data.get('bots', list())],
            query_port=data.get('queryPort'),
            autobalance=data.get('autobalance'),
            query_directly=data.get('queryDirectly'),
            rotate_bot_names=data.get('rotateBotNames')
        )

    def dump(self) -> dict:
        return {
            key: value
            for (key, value) in {
                'name': self.name,
                'address': self.address,
                'port': self.port,
                'queryPort': self.query_port,
                'mod': self.mod,
                'slots': self.slots,
                'reservedSlots': self.reserved_slots,
                'autobalance': self.autobalance,
                'queryDirectly': self.query_directly,
                'rotateBotNames': self.rotate_bot_names,
                'bots': [bot_config.dump() for bot_config in self.bots]
            }.items()
            if value is not None
        }
