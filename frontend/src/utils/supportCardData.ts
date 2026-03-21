import type { SupportCardType } from '../types';

export interface SupportCard {
    id: string;
    name: string;
    type: SupportCardType;
    rarity: 'SSR' | 'SR' | 'R';
}

export const SUPPORT_CARD_DICT: Record<string, SupportCard> = {
    'vodka-speed':          { id: 'vodka-speed',          name: 'Vodka',                type: 'speed',   rarity: 'SSR' },
    'daiwa-scarlet-speed':  { id: 'daiwa-scarlet-speed',  name: 'Daiwa Scarlet',        type: 'speed',   rarity: 'SSR' },
    'nice-nature-stamina':  { id: 'nice-nature-stamina',  name: 'Nice Nature',          type: 'stamina', rarity: 'SSR' },
    'gold-ship-stamina':    { id: 'gold-ship-stamina',    name: 'Gold Ship',            type: 'stamina', rarity: 'SSR' },
    'symboli-rudolf-power': { id: 'symboli-rudolf-power', name: 'Symboli Rudolf',       type: 'power',   rarity: 'SSR' },
    'mejiro-mcqueen-power': { id: 'mejiro-mcqueen-power', name: 'Mejiro McQueen',       type: 'power',   rarity: 'SSR' },
    'special-week-guts':    { id: 'special-week-guts',    name: 'Special Week',         type: 'guts',    rarity: 'SR'  },
    'haru-urara-guts':      { id: 'haru-urara-guts',      name: 'Haru Urara',           type: 'guts',    rarity: 'SR'  },
    'air-groove-wit':       { id: 'air-groove-wit',       name: 'Air Groove',           type: 'wit',     rarity: 'SSR' },
    'ikuno-dictus-wit':     { id: 'ikuno-dictus-wit',     name: 'Ikuno Dictus',         type: 'wit',     rarity: 'SR'  },
    'team-spica-group':     { id: 'team-spica-group',     name: 'Team Spica',           type: 'group',   rarity: 'SSR' },
    'team-rigil-group':     { id: 'team-rigil-group',     name: 'Team Rigil',           type: 'group',   rarity: 'SR'  },
    'mayano-pal':           { id: 'mayano-pal',           name: 'Mayano Top Gun',       type: 'pal',     rarity: 'SR'  },
    'taiki-shuttle-pal':    { id: 'taiki-shuttle-pal',    name: 'Taiki Shuttle',        type: 'pal',     rarity: 'SSR' },
};

export const SUPPORT_CARD_LIST = Object.values(SUPPORT_CARD_DICT);

export const SUPPORT_CARD_TYPE_META: Record<SupportCardType, { label: string; color: string; bg: string }> = {
    speed:   { label: 'Speed',   color: 'text-sky-400',     bg: 'bg-sky-500/15'     },
    stamina: { label: 'Stamina', color: 'text-rose-400',    bg: 'bg-rose-500/15'    },
    power:   { label: 'Power',   color: 'text-orange-400',  bg: 'bg-orange-500/15'  },
    guts:    { label: 'Guts',    color: 'text-yellow-400',  bg: 'bg-yellow-500/15'  },
    wit:     { label: 'Wit',     color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    group:   { label: 'Group',   color: 'text-violet-400',  bg: 'bg-violet-500/15'  },
    pal:     { label: 'Pal',     color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/15' },
};
