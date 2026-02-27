import type {Track} from "../types.ts";

export const TRACK_DICT: Record<string, Track> = {
    // --- Sapporo ---
    'sapporo-1500-turf-right': { id: 'sapporo-1500-turf-right', location: 'Sapporo', distance: 1500, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'sapporo-1800-turf-right': { id: 'sapporo-1800-turf-right', location: 'Sapporo', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'sapporo-1200-turf-right': { id: 'sapporo-1200-turf-right', location: 'Sapporo', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'sapporo-2000-turf-right': { id: 'sapporo-2000-turf-right', location: 'Sapporo', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'sapporo-2600-turf-right': { id: 'sapporo-2600-turf-right', location: 'Sapporo', distance: 2600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    // 'sapporo-1000-dirt-right': { id: 'sapporo-1000-dirt-right', location: 'Sapporo', distance: 1000, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'sapporo-1700-dirt-right': { id: 'sapporo-1700-dirt-right', location: 'Sapporo', distance: 1700, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    // 'sapporo-2400-dirt-right': { id: 'sapporo-2400-dirt-right', location: 'Sapporo', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Hakodate ---
    'hakodate-1000-turf-right': { id: 'hakodate-1000-turf-right', location: 'Hakodate', distance: 1000, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'hakodate-1200-turf-right': { id: 'hakodate-1200-turf-right', location: 'Hakodate', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'hakodate-1800-turf-right': { id: 'hakodate-1800-turf-right', location: 'Hakodate', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'hakodate-2000-turf-right': { id: 'hakodate-2000-turf-right', location: 'Hakodate', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'hakodate-2600-turf-right': { id: 'hakodate-2600-turf-right', location: 'Hakodate', distance: 2600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    // 'hakodate-1000-dirt-right': { id: 'hakodate-1000-dirt-right', location: 'Hakodate', distance: 1000, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'hakodate-1700-dirt-right': { id: 'hakodate-1700-dirt-right', location: 'Hakodate', distance: 1700, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    // 'hakodate-2400-dirt-right': { id: 'hakodate-2400-dirt-right', location: 'Hakodate', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Niigata ---
    'niigata-1000-turf-straight': { id: 'niigata-1000-turf-straight', location: 'Niigata', distance: 1000, distanceType: 'Sprint', direction: 'straight', surface: 'Turf' },
    'niigata-1200-turf-inner-left': { id: 'niigata-1200-turf-inner-left', location: 'Niigata', distance: 1200, distanceType: 'Sprint', direction: 'left', surface: 'Turf' },
    'niigata-1400-turf-inner-left': { id: 'niigata-1400-turf-inner-left', location: 'Niigata', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Turf' },
    'niigata-1600-turf-outer-left': { id: 'niigata-1600-turf-outer-left', location: 'Niigata', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Turf' },
    'niigata-1800-turf-outer-left': { id: 'niigata-1800-turf-outer-left', location: 'Niigata', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Turf' },
    'niigata-2000-turf-inner-left': { id: 'niigata-2000-turf-inner-left', location: 'Niigata', distance: 2000, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'niigata-2000-turf-outer-left': { id: 'niigata-2000-turf-outer-left', location: 'Niigata', distance: 2000, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'niigata-2200-turf-inner-left': { id: 'niigata-2200-turf-inner-left', location: 'Niigata', distance: 2200, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'niigata-2400-turf-inner-left': { id: 'niigata-2400-turf-inner-left', location: 'Niigata', distance: 2400, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'niigata-1200-dirt-left': { id: 'niigata-1200-dirt-left', location: 'Niigata', distance: 1200, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    'niigata-1800-dirt-left': { id: 'niigata-1800-dirt-left', location: 'Niigata', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'niigata-2500-dirt-left': { id: 'niigata-2500-dirt-left', location: 'Niigata', distance: 2500, distanceType: 'Long', direction: 'left', surface: 'Dirt' },

    // --- Fukushima ---
    'fukushima-1200-turf-right': { id: 'fukushima-1200-turf-right', location: 'Fukushima', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'fukushima-1800-turf-right': { id: 'fukushima-1800-turf-right', location: 'Fukushima', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'fukushima-2000-turf-right': { id: 'fukushima-2000-turf-right', location: 'Fukushima', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'fukushima-2600-turf-right': { id: 'fukushima-2600-turf-right', location: 'Fukushima', distance: 2600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'fukushima-1150-dirt-right': { id: 'fukushima-1150-dirt-right', location: 'Fukushima', distance: 1150, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'fukushima-1700-dirt-right': { id: 'fukushima-1700-dirt-right', location: 'Fukushima', distance: 1700, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    // 'fukushima-2400-dirt-right': { id: 'fukushima-2400-dirt-right', location: 'Fukushima', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Nakayama ---
    'nakayama-1200-turf-outer-right': { id: 'nakayama-1200-turf-outer-right', location: 'Nakayama', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'nakayama-1600-turf-outer-right': { id: 'nakayama-1600-turf-outer-right', location: 'Nakayama', distance: 1600, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'nakayama-1800-turf-inner-right': { id: 'nakayama-1800-turf-inner-right', location: 'Nakayama', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'nakayama-2000-turf-inner-right': { id: 'nakayama-2000-turf-inner-right', location: 'Nakayama', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'nakayama-2200-turf-outer-right': { id: 'nakayama-2200-turf-outer-right', location: 'Nakayama', distance: 2200, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'nakayama-2500-turf-inner-right': { id: 'nakayama-2500-turf-inner-right', location: 'Nakayama', distance: 2500, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'nakayama-3600-turf-inner-right': { id: 'nakayama-3600-turf-inner-right', location: 'Nakayama', distance: 3600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'nakayama-1200-dirt-right': { id: 'nakayama-1200-dirt-right', location: 'Nakayama', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'nakayama-1800-dirt-right': { id: 'nakayama-1800-dirt-right', location: 'Nakayama', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    // 'nakayama-2400-dirt-right': { id: 'nakayama-2400-dirt-right', location: 'Nakayama', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },
    // 'nakayama-2500-dirt-right': { id: 'nakayama-2500-dirt-right', location: 'Nakayama', distance: 2500, distanceType: 'Long', direction: 'right', surface: 'Dirt' },

    // --- Tokyo ---
    'tokyo-1400-turf-left': { id: 'tokyo-1400-turf-left', location: 'Tokyo', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Turf' },
    'tokyo-1600-turf-left': { id: 'tokyo-1600-turf-left', location: 'Tokyo', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Turf' },
    'tokyo-1800-turf-left': { id: 'tokyo-1800-turf-left', location: 'Tokyo', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Turf' },
    'tokyo-2000-turf-left': { id: 'tokyo-2000-turf-left', location: 'Tokyo', distance: 2000, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'tokyo-2300-turf-left': { id: 'tokyo-2300-turf-left', location: 'Tokyo', distance: 2300, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'tokyo-2400-turf-left': { id: 'tokyo-2400-turf-left', location: 'Tokyo', distance: 2400, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'tokyo-2500-turf-left': { id: 'tokyo-2500-turf-left', location: 'Tokyo', distance: 2500, distanceType: 'Long', direction: 'left', surface: 'Turf' },
    'tokyo-3400-turf-left': { id: 'tokyo-3400-turf-left', location: 'Tokyo', distance: 3400, distanceType: 'Long', direction: 'left', surface: 'Turf' },
    'tokyo-1300-dirt-left': { id: 'tokyo-1300-dirt-left', location: 'Tokyo', distance: 1300, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    'tokyo-1400-dirt-left': { id: 'tokyo-1400-dirt-left', location: 'Tokyo', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    'tokyo-1600-dirt-left': { id: 'tokyo-1600-dirt-left', location: 'Tokyo', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    'tokyo-2100-dirt-left': { id: 'tokyo-2100-dirt-left', location: 'Tokyo', distance: 2100, distanceType: 'Medium', direction: 'left', surface: 'Dirt' },
    // 'tokyo-2400-dirt-left': { id: 'tokyo-2400-dirt-left', location: 'Tokyo', distance: 2400, distanceType: 'Medium', direction: 'left', surface: 'Dirt' },

    // --- Chukyo ---
    'chukyo-1200-turf-left': { id: 'chukyo-1200-turf-left', location: 'Chukyo', distance: 1200, distanceType: 'Sprint', direction: 'left', surface: 'Turf' },
    'chukyo-1400-turf-left': { id: 'chukyo-1400-turf-left', location: 'Chukyo', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Turf' },
    'chukyo-1600-turf-left': { id: 'chukyo-1600-turf-left', location: 'Chukyo', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Turf' },
    'chukyo-2000-turf-left': { id: 'chukyo-2000-turf-left', location: 'Chukyo', distance: 2000, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    'chukyo-2200-turf-left': { id: 'chukyo-2200-turf-left', location: 'Chukyo', distance: 2200, distanceType: 'Medium', direction: 'left', surface: 'Turf' },
    // 'chukyo-1200-dirt-left': { id: 'chukyo-1200-dirt-left', location: 'Chukyo', distance: 1200, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    'chukyo-1400-dirt-left': { id: 'chukyo-1400-dirt-left', location: 'Chukyo', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    'chukyo-1800-dirt-left': { id: 'chukyo-1800-dirt-left', location: 'Chukyo', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'chukyo-1900-dirt-left': { id: 'chukyo-1900-dirt-left', location: 'Chukyo', distance: 1900, distanceType: 'Medium', direction: 'left', surface: 'Dirt' },

    // --- Kyoto ---
    'kyoto-1200-turf-inner-right': { id: 'kyoto-1200-turf-inner-right', location: 'Kyoto', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'kyoto-1400-turf-inner-right': { id: 'kyoto-1400-turf-inner-right', location: 'Kyoto', distance: 1400, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'kyoto-1400-turf-outer-right': { id: 'kyoto-1400-turf-outer-right', location: 'Kyoto', distance: 1400, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'kyoto-1600-turf-inner-right': { id: 'kyoto-1600-turf-inner-right', location: 'Kyoto', distance: 1600, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'kyoto-1600-turf-outer-right': { id: 'kyoto-1600-turf-outer-right', location: 'Kyoto', distance: 1600, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'kyoto-1800-turf-outer-right': { id: 'kyoto-1800-turf-outer-right', location: 'Kyoto', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'kyoto-2000-turf-inner-right': { id: 'kyoto-2000-turf-inner-right', location: 'Kyoto', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'kyoto-2200-turf-outer-right': { id: 'kyoto-2200-turf-outer-right', location: 'Kyoto', distance: 2200, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'kyoto-2400-turf-outer-right': { id: 'kyoto-2400-turf-outer-right', location: 'Kyoto', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'kyoto-3000-turf-outer-right': { id: 'kyoto-3000-turf-outer-right', location: 'Kyoto', distance: 3000, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'kyoto-3200-turf-outer-right': { id: 'kyoto-3200-turf-outer-right', location: 'Kyoto', distance: 3200, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'kyoto-1200-dirt-right': { id: 'kyoto-1200-dirt-right', location: 'Kyoto', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'kyoto-1400-dirt-right': { id: 'kyoto-1400-dirt-right', location: 'Kyoto', distance: 1400, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'kyoto-1800-dirt-right': { id: 'kyoto-1800-dirt-right', location: 'Kyoto', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    'kyoto-1900-dirt-right': { id: 'kyoto-1900-dirt-right', location: 'Kyoto', distance: 1900, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Hanshin ---
    'hanshin-1200-turf-inner-right': { id: 'hanshin-1200-turf-inner-right', location: 'Hanshin', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'hanshin-1400-turf-inner-right': { id: 'hanshin-1400-turf-inner-right', location: 'Hanshin', distance: 1400, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'hanshin-1600-turf-outer-right': { id: 'hanshin-1600-turf-outer-right', location: 'Hanshin', distance: 1600, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'hanshin-1800-turf-outer-right': { id: 'hanshin-1800-turf-outer-right', location: 'Hanshin', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'hanshin-2000-turf-inner-right': { id: 'hanshin-2000-turf-inner-right', location: 'Hanshin', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'hanshin-2200-turf-inner-right': { id: 'hanshin-2200-turf-inner-right', location: 'Hanshin', distance: 2200, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'hanshin-2400-turf-outer-right': { id: 'hanshin-2400-turf-outer-right', location: 'Hanshin', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'hanshin-2600-turf-outer-right': { id: 'hanshin-2600-turf-outer-right', location: 'Hanshin', distance: 2600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    'hanshin-3000-turf-inner-right': { id: 'hanshin-3000-turf-inner-right', location: 'Hanshin', distance: 3000, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    // 'hanshin-1200-dirt-right': { id: 'hanshin-1200-dirt-right', location: 'Hanshin', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'hanshin-1400-dirt-right': { id: 'hanshin-1400-dirt-right', location: 'Hanshin', distance: 1400, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'hanshin-1800-dirt-right': { id: 'hanshin-1800-dirt-right', location: 'Hanshin', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    'hanshin-2000-dirt-right': { id: 'hanshin-2000-dirt-right', location: 'Hanshin', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },
    'hanshin-3200-turf-outer-to-inner-right': { id: 'hanshin-3200-turf-outer-to-inner-right', location: 'Hanshin', distance: 3200, distanceType: 'Long', direction: 'right', surface: 'Turf' },

    // --- Kokura ---
    'kokura-1200-turf-right': { id: 'kokura-1200-turf-right', location: 'Kokura', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Turf' },
    'kokura-1800-turf-right': { id: 'kokura-1800-turf-right', location: 'Kokura', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Turf' },
    'kokura-2000-turf-right': { id: 'kokura-2000-turf-right', location: 'Kokura', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Turf' },
    'kokura-2600-turf-right': { id: 'kokura-2600-turf-right', location: 'Kokura', distance: 2600, distanceType: 'Long', direction: 'right', surface: 'Turf' },
    // 'kokura-1000-dirt-right': { id: 'kokura-1000-dirt-right', location: 'Kokura', distance: 1000, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'kokura-1700-dirt-right': { id: 'kokura-1700-dirt-right', location: 'Kokura', distance: 1700, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    // 'kokura-2400-dirt-right': { id: 'kokura-2400-dirt-right', location: 'Kokura', distance: 2400, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Oi ---
    'oi-1200-dirt-right': { id: 'oi-1200-dirt-right', location: 'Oi', distance: 1200, distanceType: 'Sprint', direction: 'right', surface: 'Dirt' },
    'oi-1800-dirt-right': { id: 'oi-1800-dirt-right', location: 'Oi', distance: 1800, distanceType: 'Mile', direction: 'right', surface: 'Dirt' },
    'oi-2000-dirt-right': { id: 'oi-2000-dirt-right', location: 'Oi', distance: 2000, distanceType: 'Medium', direction: 'right', surface: 'Dirt' },

    // --- Kawasaki ---
    // 'kawasaki-1400-dirt': { id: 'kawasaki-1400-dirt-left', location: 'Kawasaki', distance: 1400, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    // 'kawasaki-1600-dirt': { id: 'kawasaki-1600-dirt-left', location: 'Kawasaki', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'kawasaki-2100-dirt': { id: 'kawasaki-2100-dirt-left', location: 'Kawasaki', distance: 2100, distanceType: 'Medium', direction: 'left', surface: 'Dirt' },

    // --- Funabashi ---
    // 'funabashi-1000-dirt': { id: 'funabashi-1000-dirt-left', location: 'Funabashi', distance: 1000, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    // 'funabashi-1600-dirt': { id: 'funabashi-1600-dirt-left', location: 'Funabashi', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'funabashi-1800-dirt': { id: 'funabashi-1800-dirt-left', location: 'Funabashi', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'funabashi-2400-dirt': { id: 'funabashi-2400-dirt-left', location: 'Funabashi', distance: 2400, distanceType: 'Medium', direction: 'left', surface: 'Dirt' },

    // --- Morioka ---
    // 'morioka-1200-dirt': { id: 'morioka-1200-dirt-left', location: 'Morioka', distance: 1200, distanceType: 'Sprint', direction: 'left', surface: 'Dirt' },
    // 'morioka-1600-dirt': { id: 'morioka-1600-dirt-left', location: 'Morioka', distance: 1600, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'morioka-1800-dirt': { id: 'morioka-1800-dirt-left', location: 'Morioka', distance: 1800, distanceType: 'Mile', direction: 'left', surface: 'Dirt' },
    // 'morioka-2000-dirt': { id: 'morioka-2000-dirt-left', location: 'Morioka', distance: 2000, distanceType: 'Medium', direction: 'left', surface: 'Dirt' }
};