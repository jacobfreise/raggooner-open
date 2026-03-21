import type { SupportCardType } from '../types';

export interface SupportCard {
    id: string;
    name: string;
    type: SupportCardType;
    rarity: 'SSR' | 'SR' | 'R';
    cardName: string;
}

export const SUPPORT_CARD_DICT: Record<string, SupportCard> = {
    'air-shakur-wit':           { id: 'air-shakur-wit',           name: 'Air Shakur',         cardName: '7 Centimeters Ahead',                                        type: 'wit',     rarity: 'SSR' },
    'bamboo-memory-power':      { id: 'bamboo-memory-power',      name: 'Bamboo Memory',      cardName: 'Head-on Fight!',                                             type: 'power',   rarity: 'SSR' },
    'biko-pegasus-speed':       { id: 'biko-pegasus-speed',       name: 'Biko Pegasus',       cardName: 'Death Strike! W Carrot Punch!',                              type: 'speed',   rarity: 'SSR' },
    'daiwa-scarlet-power':      { id: 'daiwa-scarlet-power',      name: 'Daiwa Scarlet',      cardName: 'Mini☆Vacation',                                              type: 'power',   rarity: 'SSR' },
    'el-condor-pasa-power':     { id: 'el-condor-pasa-power',     name: 'El Condor Pasa',     cardName: 'Passion Championa!',                                         type: 'power',   rarity: 'SSR' },
    'fine-motion-wit':          { id: 'fine-motion-wit',          name: 'Fine Motion',        cardName: 'With Gratitude to Your Fingertips',                          type: 'wit',     rarity: 'SSR' },
    'gold-city-speed':          { id: 'gold-city-speed',          name: 'Gold City',          cardName: 'Run(my)way',                                                 type: 'speed',   rarity: 'SSR' },
    'gold-ship-stamina':        { id: 'gold-ship-stamina',        name: 'Gold Ship',          cardName: 'Advance of the Unsinkable Ship',                             type: 'stamina', rarity: 'SSR' },
    'gold-ship-speed':          { id: 'gold-ship-speed',          name: 'Gold Ship',          cardName: 'That Time I Became The Strongest',                           type: 'speed',   rarity: 'SSR' },
    'grass-wonder-speed':       { id: 'grass-wonder-speed',       name: 'Grass Wonder',       cardName: 'In a Field of All Kinds of Flowers, the One Special Flower You Find', type: 'speed', rarity: 'SSR' },
    'haru-urara-guts':          { id: 'haru-urara-guts',          name: 'Haru Urara',         cardName: 'Urara~na Holiday',                                           type: 'guts',    rarity: 'SSR' },
    'hishi-akebono-guts':       { id: 'hishi-akebono-guts',       name: 'Hishi Akebono',      cardName: 'Who Wants the First Bite?',                                  type: 'guts',    rarity: 'SSR' },
    'ikuno-dictus-wit':         { id: 'ikuno-dictus-wit',         name: 'Ikuno Dictus',       cardName: 'Warm Heart, Soft Steps',                                     type: 'wit',     rarity: 'SSR' },
    'ines-fujin-guts':          { id: 'ines-fujin-guts',          name: 'Ines Fujin',         cardName: 'Jump Out, Glitter!',                                         type: 'guts',    rarity: 'SSR' },
    'kawakami-princess-speed':  { id: 'kawakami-princess-speed',  name: 'Kawakami Princess',  cardName: 'Princess Bride',                                             type: 'speed',   rarity: 'SSR' },
    'king-halo-power':          { id: 'king-halo-power',          name: 'King Halo',          cardName: 'Tonight, We Waltz',                                          type: 'power',   rarity: 'SSR' },
    'kitasan-black-speed':      { id: 'kitasan-black-speed',      name: 'Kitasan Black',      cardName: 'Fire at My Heels!',                                          type: 'speed',   rarity: 'SSR' },
    'matikanetannhauser-guts':  { id: 'matikanetannhauser-guts',  name: 'Matikanetannhauser', cardName: 'Just Keep Going',                                            type: 'guts',    rarity: 'SSR' },
    'mejiro-dober-wit':         { id: 'mejiro-dober-wit',         name: 'Mejiro Dober',       cardName: 'My Thoughts, My Desires',                                    type: 'wit',     rarity: 'SSR' },
    'mejiro-mcqueen-stamina':   { id: 'mejiro-mcqueen-stamina',   name: 'Mejiro McQueen',     cardName: 'Your Team Ace',                                              type: 'stamina', rarity: 'SSR' },
    'mejiro-palmer-guts':       { id: 'mejiro-palmer-guts',       name: 'Mejiro Palmer',      cardName: 'Go Ahead and Laugh',                                         type: 'guts',    rarity: 'SSR' },
    'mejiro-ryan-power':        { id: 'mejiro-ryan-power',        name: 'Mejiro Ryan',        cardName: 'Winning Pitch',                                              type: 'power',   rarity: 'SSR' },
    'mihono-bourbon-guts':      { id: 'mihono-bourbon-guts',      name: 'Mihono Bourbon',     cardName: 'The Ghost Finds Halloween Magic',                            type: 'guts',    rarity: 'SSR' },
    'narita-brian-speed':       { id: 'narita-brian-speed',       name: 'Narita Brian',       cardName: 'Two Pieces',                                                 type: 'speed',   rarity: 'SSR' },
    'nice-nature-wit':          { id: 'nice-nature-wit',          name: 'Nice Nature',        cardName: 'Daring to Dream',                                            type: 'wit',     rarity: 'SSR' },
    'nishino-flower-power':     { id: 'nishino-flower-power',     name: 'Nishino Flower',     cardName: 'Even With Small Buds',                                       type: 'power',   rarity: 'SSR' },
    'oguri-cap-power':          { id: 'oguri-cap-power',          name: 'Oguri Cap',          cardName: 'Get Lots of Hugs for Me',                                    type: 'power',   rarity: 'SSR' },
    'rice-shower-stamina':      { id: 'rice-shower-stamina',      name: 'Rice Shower',        cardName: 'Showered In Joy',                                            type: 'stamina', rarity: 'SSR' },
    'rice-shower-power':        { id: 'rice-shower-power',        name: 'Rice Shower',        cardName: 'Happiness Just around the Bend',                             type: 'power',   rarity: 'SSR' },
    'riko-kashimoto-pal':       { id: 'riko-kashimoto-pal',       name: 'Riko Kashimoto',     cardName: 'Planned Perfection',                                         type: 'pal',     rarity: 'SSR' },
    'sakura-bakushin-o-speed':  { id: 'sakura-bakushin-o-speed',  name: 'Sakura Bakushin O',  cardName: 'Fast! Good! Fast!',                                          type: 'speed',   rarity: 'SSR' },
    'sakura-chiyono-o-stamina': { id: 'sakura-chiyono-o-stamina', name: 'Sakura Chiyono O',   cardName: 'Peak Sakura Season',                                         type: 'stamina', rarity: 'SSR' },
    'satono-diamond-stamina':   { id: 'satono-diamond-stamina',   name: 'Satono Diamond',     cardName: 'The Will to Overtake',                                       type: 'stamina', rarity: 'SSR' },
    'seiun-sky-stamina':        { id: 'seiun-sky-stamina',        name: 'Seiun Sky',          cardName: 'Long-Awaited Plot',                                          type: 'stamina', rarity: 'SSR' },
    'seiun-sky-wit':            { id: 'seiun-sky-wit',            name: 'Seiun Sky',          cardName: 'Paint the Sky Red',                                          type: 'wit',     rarity: 'SSR' },
    'silence-suzuka-speed':     { id: 'silence-suzuka-speed',     name: 'Silence Suzuka',     cardName: 'Beyond the Shining Scenery',                                 type: 'speed',   rarity: 'SSR' },
    'silence-suzuka-stamina':   { id: 'silence-suzuka-stamina',   name: 'Silence Suzuka',     cardName: 'Winning Dream',                                              type: 'stamina', rarity: 'SSR' },
    'smart-falcon-speed':       { id: 'smart-falcon-speed',       name: 'Smart Falcon',       cardName: 'This Is My Uma Idol Road☆',                                  type: 'speed',   rarity: 'SSR' },
    'special-week-guts':        { id: 'special-week-guts',        name: 'Special Week',       cardName: 'The Best Stage in Japan',                                    type: 'guts',    rarity: 'SSR' },
    'special-week-speed':       { id: 'special-week-speed',       name: 'Special Week',       cardName: 'The Setting Sun and Rising Stars',                           type: 'speed',   rarity: 'SSR' },
    'super-creek-stamina':      { id: 'super-creek-stamina',      name: 'Super Creek',        cardName: 'One Grain of Comfort',                                       type: 'stamina', rarity: 'SSR' },
    'sweep-tosho-speed':        { id: 'sweep-tosho-speed',        name: 'Sweep Tosho',        cardName: 'It\'s All Mine!',                                            type: 'speed',   rarity: 'SSR' },
    'tamamo-cross-stamina':     { id: 'tamamo-cross-stamina',     name: 'Tamamo Cross',       cardName: 'Inazuma Daughter Who Cuts Through the Heavens!',             type: 'stamina', rarity: 'SSR' },
    'tamamo-cross-power':       { id: 'tamamo-cross-power',       name: 'Tamamo Cross',       cardName: 'Beware! Halloween Night!',                                   type: 'power',   rarity: 'SSR' },
    'tazuna-hayakawa-pal':      { id: 'tazuna-hayakawa-pal',      name: 'Tazuna Hayakawa',    cardName: 'Welcome to Tracen Academy!',                                 type: 'pal',     rarity: 'SSR' },
    'tokai-teio-speed':         { id: 'tokai-teio-speed',         name: 'Tokai Teio',         cardName: 'Dreams Are Something to Raise!',                             type: 'speed',   rarity: 'SSR' },
    'twin-turbo-speed':         { id: 'twin-turbo-speed',         name: 'Twin Turbo',         cardName: 'Turbo Booooost',                                             type: 'speed',   rarity: 'SSR' },
    'vodka-power':              { id: 'vodka-power',              name: 'Vodka',              cardName: 'Road of Vodka',                                              type: 'power',   rarity: 'SSR' },
    'winning-ticket-guts':      { id: 'winning-ticket-guts',      name: 'Winning Ticket',     cardName: 'B・N・Winner!!',                                             type: 'guts',    rarity: 'SSR' },
    'winning-ticket-power':     { id: 'winning-ticket-power',     name: 'Winning Ticket',     cardName: 'Dreams Do Come True!',                                       type: 'power',   rarity: 'SSR' },
    'winning-ticket-stamina':   { id: 'winning-ticket-stamina',   name: 'Winning Ticket',     cardName: 'Full-Blown Tantrum',                                         type: 'stamina', rarity: 'SSR' },
    'yaeno-muteki-power':       { id: 'yaeno-muteki-power',       name: 'Yaeno Muteki',       cardName: 'Fiery Discipline',                                           type: 'power',   rarity: 'SSR' },
    'yukino-bijin-wit':         { id: 'yukino-bijin-wit',         name: 'Yukino Bijin',       cardName: 'Hometown Cheers',                                            type: 'wit',     rarity: 'SSR' },
    'zenno-rob-roy-stamina':    { id: 'zenno-rob-roy-stamina',    name: 'Zenno Rob Roy',      cardName: 'Magical Heroine',                                            type: 'stamina', rarity: 'SSR' },
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
