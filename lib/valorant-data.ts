// Valorant Agents and Maps Data with Real Image Paths
// All paths updated to match actual filenames in public/abilities

export interface AgentAbility {
    name: string
    description: string
    icon: string // path to ability icon image
    slot: 'C' | 'Q' | 'E' | 'X' // ability slot
}

export interface Agent {
    id: string
    name: string
    role: 'Duelist' | 'Controller' | 'Initiator' | 'Sentinel'
    icon: string // path to agent avatar image
    color: string // agent's signature color
    abilities: AgentAbility[]
}

export interface ValorantMap {
    id: string
    name: string
    image: string // path to map minimap image
}

// Valorant Agents with their abilities and image paths
export const VALORANT_AGENTS: Agent[] = [
    {
        id: 'jett',
        name: 'Jett',
        role: 'Duelist',
        icon: '/agent_avatars/jett.png',
        color: '#94D5F5',
        abilities: [
            { name: 'Cloudburst', description: 'Throw a cloud of fog', icon: '/abilities/jett/cloudburst.png', slot: 'C' },
            { name: 'Updraft', description: 'Propel upwards', icon: '/abilities/jett/updraft.png', slot: 'Q' },
            { name: 'Tailwind', description: 'Dash forward', icon: '/abilities/jett/tailwind.png', slot: 'E' },
            { name: 'Blade Storm', description: 'Throw deadly knives', icon: '/abilities/jett/blade_storm.png', slot: 'X' },
        ],
    },
    {
        id: 'sage',
        name: 'Sage',
        role: 'Sentinel',
        icon: '/agent_avatars/sage.png',
        color: '#5EC99B',
        abilities: [
            { name: 'Barrier Orb', description: 'Create a wall', icon: '/abilities/sage/barrier orb.png', slot: 'C' },
            { name: 'Slow Orb', description: 'Slow enemies', icon: '/abilities/sage/slow_orb.png', slot: 'Q' },
            { name: 'Healing Orb', description: 'Heal allies', icon: '/abilities/sage/healing_Orb.png', slot: 'E' },
            { name: 'Resurrection', description: 'Revive a teammate', icon: '/abilities/sage/resurrection.png', slot: 'X' },
        ],
    },
    {
        id: 'omen',
        name: 'Omen',
        role: 'Controller',
        icon: '/agent_avatars/omen.png',
        color: '#4A5282',
        abilities: [
            { name: 'Shrouded Step', description: 'Teleport short distance', icon: '/abilities/omen/shrouded step.png', slot: 'C' },
            { name: 'Paranoia', description: 'Blind enemies', icon: '/abilities/omen/paranoia.png', slot: 'Q' },
            { name: 'Dark Cover', description: 'Deploy smoke', icon: '/abilities/omen/dark_cover.png', slot: 'E' },
            { name: 'From the Shadows', description: 'Teleport anywhere', icon: '/abilities/omen/from_the_shadows.png', slot: 'X' },
        ],
    },
    {
        id: 'sova',
        name: 'Sova',
        role: 'Initiator',
        icon: '/agent_avatars/sova.png',
        color: '#3B6EA5',
        abilities: [
            { name: 'Owl Drone', description: 'Deploy recon drone', icon: '/abilities/sova/owl drone.png', slot: 'C' },
            { name: 'Shock Bolt', description: 'Damaging arrow', icon: '/abilities/sova/shock_bolt.png', slot: 'Q' },
            { name: 'Recon Bolt', description: 'Reveal enemies', icon: '/abilities/sova/recon_bolt.png', slot: 'E' },
            { name: "Hunter's Fury", description: 'Fire energy blasts', icon: "/abilities/sova/hunter's_fury.png", slot: 'X' },
        ],
    },
    {
        id: 'phoenix',
        name: 'Phoenix',
        role: 'Duelist',
        icon: '/agent_avatars/phoenix.png',
        color: '#EB4B4B',
        abilities: [
            { name: 'Blaze', description: 'Fire wall', icon: '/abilities/phoenix/blaze.png', slot: 'C' },
            { name: 'Curveball', description: 'Flash enemies', icon: '/abilities/phoenix/curveball.png', slot: 'Q' },
            { name: 'Hot Hands', description: 'Fire zone', icon: '/abilities/phoenix/hot_hands.png', slot: 'E' },
            { name: 'Run it Back', description: 'Respawn at marker', icon: '/abilities/phoenix/run_it_back.png', slot: 'X' },
        ],
    },
    {
        id: 'brimstone',
        name: 'Brimstone',
        role: 'Controller',
        icon: '/agent_avatars/brimstone.png',
        color: '#E8794E',
        abilities: [
            { name: 'Stim Beacon', description: 'Buff fire rate', icon: '/abilities/brimstone/stim beacon.png', slot: 'C' },
            { name: 'Incendiary', description: 'Fire grenade', icon: '/abilities/brimstone/incendiary.png', slot: 'Q' },
            { name: 'Sky Smoke', description: 'Deploy smokes', icon: '/abilities/brimstone/sky_smoke.png', slot: 'E' },
            { name: 'Orbital Strike', description: 'Laser from sky', icon: '/abilities/brimstone/orbital_strike.png', slot: 'X' },
        ],
    },
    {
        id: 'viper',
        name: 'Viper',
        role: 'Controller',
        icon: '/agent_avatars/viper.png',
        color: '#46A854',
        abilities: [
            { name: 'Snake Bite', description: 'Acid pool', icon: '/abilities/viper/snakebite.png', slot: 'C' },
            { name: 'Poison Cloud', description: 'Toxic gas', icon: '/abilities/viper/poison_cloud.png', slot: 'Q' },
            { name: 'Toxic Screen', description: 'Poison wall', icon: '/abilities/viper/toxic_screen.png', slot: 'E' },
            { name: "Viper's Pit", description: 'Toxic cloud zone', icon: '/abilities/viper/vipers_pit.png', slot: 'X' },
        ],
    },
    {
        id: 'cypher',
        name: 'Cypher',
        role: 'Sentinel',
        icon: '/agent_avatars/cypher.png',
        color: '#E3E3E3',
        abilities: [
            { name: 'Trapwire', description: 'Tripwire trap', icon: '/abilities/cypher/trapwire.png', slot: 'C' },
            { name: 'Cyber Cage', description: 'Zone trap', icon: '/abilities/cypher/cyber_cage.png', slot: 'Q' },
            { name: 'Spycam', description: 'Remote camera', icon: '/abilities/cypher/spycam.png', slot: 'E' },
            { name: 'Neural Theft', description: 'Reveal enemies', icon: '/abilities/cypher/neural_theft.png', slot: 'X' },
        ],
    },
    {
        id: 'reyna',
        name: 'Reyna',
        role: 'Duelist',
        icon: '/agent_avatars/reyna.png',
        color: '#9B4D9F',
        abilities: [
            { name: 'Leer', description: 'Blind enemies', icon: '/abilities/reyna/leer.png', slot: 'C' },  // NOTE: Missing file!
            { name: 'Devour', description: 'Heal from soul', icon: '/abilities/reyna/devour.png', slot: 'Q' },
            { name: 'Dismiss', description: 'Become invulnerable', icon: '/abilities/reyna/dismiss.png', slot: 'E' },
            { name: 'Empress', description: 'Enhanced combat', icon: '/abilities/reyna/empress.png', slot: 'X' },
        ],
    },
    {
        id: 'killjoy',
        name: 'Killjoy',
        role: 'Sentinel',
        icon: '/agent_avatars/killjoy.png',
        color: '#FFD93D',
        abilities: [
            { name: 'Nanoswarm', description: 'Hidden grenade', icon: '/abilities/killjoy/nanoswarm.png', slot: 'C' },
            { name: 'Alarmbot', description: 'Tracking bot', icon: '/abilities/killjoy/alarmbot.png', slot: 'Q' },
            { name: 'Turret', description: 'Auto-firing turret', icon: '/abilities/killjoy/turret.png', slot: 'E' },
            { name: 'Lockdown', description: 'Detain enemies', icon: '/abilities/killjoy/lockdown.png', slot: 'X' },
        ],
    },
    {
        id: 'breach',
        name: 'Breach',
        role: 'Initiator',
        icon: '/agent_avatars/breach.png',
        color: '#D4682E',
        abilities: [
            { name: 'Aftershock', description: 'Fusion charge', icon: '/abilities/breach/aftershock.png', slot: 'C' },
            { name: 'Flashpoint', description: 'Blinding charge', icon: '/abilities/breach/flashpoint.png', slot: 'Q' },
            { name: 'Fault Line', description: 'Seismic blast', icon: '/abilities/breach/fault line.png', slot: 'E' },
            { name: 'Rolling Thunder', description: 'Earthquake', icon: '/abilities/breach/rolling_thunder.png', slot: 'X' },
        ],
    },
    {
        id: 'raze',
        name: 'Raze',
        role: 'Duelist',
        icon: '/agent_avatars/raze.png',
        color: '#F5955F',
        abilities: [
            { name: 'Boom Bot', description: 'Tracking robot', icon: '/abilities/raze/boom bot.png', slot: 'C' },
            { name: 'Blast Pack', description: 'Explosive satchel', icon: '/abilities/raze/blast_pack.png', slot: 'Q' },
            { name: 'Paint Shells', description: 'Cluster grenade', icon: '/abilities/raze/paint_shells.png', slot: 'E' },
            { name: 'Showstopper', description: 'Rocket launcher', icon: '/abilities/raze/showstopper.png', slot: 'X' },
        ],
    },
    {
        id: 'astra',
        name: 'Astra',
        role: 'Controller',
        icon: '/agent_avatars/astra.png',
        color: '#9B7EBD',
        abilities: [
            { name: 'Gravity Well', description: 'Pull enemies', icon: '/abilities/astra/gravity well.png', slot: 'C' },
            { name: 'Nova Pulse', description: 'Concuss enemies', icon: '/abilities/astra/star.png', slot: 'Q' },  // Using star.png
            { name: 'Nebula', description: 'Place smoke', icon: '/abilities/astra/nebula.png', slot: 'E' },
            { name: 'Cosmic Divide', description: 'Block bullets', icon: '/abilities/astra/astralform.png', slot: 'X' },  // Using astralform.png
        ],
    },
    {
        id: 'kayo',
        name: 'KAY/O',
        role: 'Initiator',
        icon: '/agent_avatars/kayo.png',
        color: '#7C8FA5',
        abilities: [
            { name: 'FRAG/MENT', description: 'Explosive fragment', icon: '/abilities/kayo/fragment.png', slot: 'C' },
            { name: 'FLASH/DRIVE', description: 'Flash grenade', icon: '/abilities/kayo/flashdrive.png', slot: 'Q' },
            { name: 'ZERO/POINT', description: 'Suppress abilities', icon: '/abilities/kayo/zeropoint.png', slot: 'E' },
            { name: 'NULL/CMD', description: 'Overload', icon: '/abilities/kayo/nullcmd.png', slot: 'X' },
        ],
    },
    {
        id: 'chamber',
        name: 'Chamber',
        role: 'Sentinel',
        icon: '/agent_avatars/chamber.png',
        color: '#D4AF37',
        abilities: [
            { name: 'Trademark', description: 'Trap that slows', icon: '/abilities/chamber/trademark.png', slot: 'C' },
            { name: 'Headhunter', description: 'Heavy pistol', icon: '/abilities/chamber/headhunter.png', slot: 'Q' },
            { name: 'Rendezvous', description: 'Teleport anchors', icon: '/abilities/chamber/Rendezvous.png', slot: 'E' },
            { name: 'Tour De Force', description: 'Powerful sniper', icon: '/abilities/chamber/tour_De_Force.png', slot: 'X' },
        ],
    },
    {
        id: 'neon',
        name: 'Neon',
        role: 'Duelist',
        icon: '/agent_avatars/neon.png',
        color: '#3B82F6',
        abilities: [
            { name: 'Fast Lane', description: 'Energy walls', icon: '/abilities/neon/fast_lane.png', slot: 'C' },
            { name: 'Relay Bolt', description: 'Concuss bolt', icon: '/abilities/neon/relay bolt.png', slot: 'Q' },
            { name: 'High Gear', description: 'Sprint and slide', icon: '/abilities/neon/high_gear.png', slot: 'E' },
            { name: 'Overdrive', description: 'Lightning beam', icon: '/abilities/neon/overdrive.png', slot: 'X' },
        ],
    },
    {
        id: 'fade',
        name: 'Fade',
        role: 'Initiator',
        icon: '/agent_avatars/fade.png',
        color: '#2C3E50',
        abilities: [
            { name: 'Prowler', description: 'Tracking creature', icon: '/abilities/fade/prowler.png', slot: 'C' },
            { name: 'Seize', description: 'Tether enemies', icon: '/abilities/fade/seize.png', slot: 'Q' },
            { name: 'Haunt', description: 'Reveal enemies', icon: '/abilities/fade/fade_haunt.png', slot: 'E' },
            { name: 'Nightfall', description: 'Wave of terror', icon: '/abilities/fade/nightfall.png', slot: 'X' },
        ],
    },
    {
        id: 'harbor',
        name: 'Harbor',
        role: 'Controller',
        icon: '/agent_avatars/harbor.png',
        color: '#4FC3F7',
        abilities: [
            { name: 'Cascade', description: 'Water wave', icon: '/abilities/harbor/cascade.png', slot: 'C' },
            { name: 'Cove', description: 'Shield sphere', icon: '/abilities/harbor/cove.png', slot: 'Q' },
            { name: 'High Tide', description: 'Water wall', icon: '/abilities/harbor/high_tide.png', slot: 'E' },
            { name: 'Reckoning', description: 'Geyser strike', icon: '/abilities/harbor/reckoning.png', slot: 'X' },
        ],
    },
    {
        id: 'gekko',
        name: 'Gekko',
        role: 'Initiator',
        icon: '/agent_avatars/gekko.png',
        color: '#A8E063',
        abilities: [
            { name: 'Mosh Pit', description: 'Explosive creature', icon: '/abilities/gekko/mosh pit.png', slot: 'C' },
            { name: 'Wingman', description: 'Plant/defuse bot', icon: '/abilities/gekko/wingman.png', slot: 'Q' },
            { name: 'Dizzy', description: 'Blinding plasma', icon: '/abilities/gekko/dizzy.png', slot: 'E' },
            { name: 'Thrash', description: 'Detain creature', icon: '/abilities/gekko/thrash.png', slot: 'X' },
        ],
    },
    {
        id: 'skye',
        name: 'Skye',
        role: 'Initiator',
        icon: '/agent_avatars/skye.png',
        color: '#7CB342',
        abilities: [
            { name: 'Regrowth', description: 'Heal allies', icon: '/abilities/skye/regrowth.png', slot: 'C' },
            { name: 'Trailblazer', description: 'Tiger scout', icon: '/abilities/skye/trailblazer.png', slot: 'Q' },
            { name: 'Guiding Light', description: 'Flash hawk', icon: '/abilities/skye/guiding_light.png', slot: 'E' },
            { name: 'Seekers', description: 'Track enemies', icon: '/abilities/skye/ultimate.png', slot: 'X' },
        ],
    },
    {
        id: 'yoru',
        name: 'Yoru',
        role: 'Duelist',
        icon: '/agent_avatars/yoru.png',
        color: '#4A5C8C',
        abilities: [
            { name: 'Fakeout', description: 'Fake footsteps', icon: '/abilities/yoru/fakeout.png', slot: 'C' },
            { name: 'Blindside', description: 'Flash grenade', icon: '/abilities/yoru/blindside.png', slot: 'Q' },
            { name: 'Gatecrash', description: 'Teleport tether', icon: '/abilities/yoru/gatecrash.png', slot: 'E' },
            { name: 'Dimensional Drift', description: 'Invisible form', icon: '/abilities/yoru/dimensional_Rift.png', slot: 'X' },
        ],
    },
]

// Valorant Maps with image paths
export const VALORANT_MAPS: ValorantMap[] = [
    { id: 'bind', name: 'Bind', image: '/maps/bind.png' },
    { id: 'haven', name: 'Haven', image: '/maps/haven.png' },
    { id: 'split', name: 'Split', image: '/maps/split.png' },
    { id: 'ascent', name: 'Ascent', image: '/maps/ascent.png' },
    { id: 'icebox', name: 'Icebox', image: '/maps/icebox.png' },
    { id: 'breeze', name: 'Breeze', image: '/maps/breeze.png' },
    { id: 'fracture', name: 'Fracture', image: '/maps/fracture.png' },
    { id: 'pearl', name: 'Pearl', image: '/maps/pearl.png' },
    { id: 'lotus', name: 'Lotus', image: '/maps/lotus.png' },
    { id: 'sunset', name: 'Sunset', image: '/maps/sunset.png' },
    { id: 'abyss', name: 'Abyss', image: '/maps/abyss.png' },
]

// Helper functions
export const getAgentById = (id: string): Agent | undefined => {
    return VALORANT_AGENTS.find(agent => agent.id === id)
}

export const getMapById = (id: string): ValorantMap | undefined => {
    return VALORANT_MAPS.find(map => map.id === id)
}

export const getAgentsByRole = (role: Agent['role']): Agent[] => {
    return VALORANT_AGENTS.filter(agent => agent.role === role)
}
