"""Registry of every Tidelock model: builder, budget class, runtime contract, chapters.

`nodes` maps each required node name to its required parent node name (None =
any parent). Required nodes must be empties with identity rotation.
`materials` lists material names the runtime looks up (recolours / pulses).
"""
import importlib
from dataclasses import dataclass, field

BUDGET = {'character': 3000, 'vehicle': 9000, 'prop': 2500}
TOTAL_BYTES_LIMIT = 4.5 * 1024 * 1024


@dataclass
class Spec:
    name: str
    builder: str
    kind: str
    nodes: dict = field(default_factory=dict)
    materials: tuple = ()
    chapters: tuple = ()
    title: str = ''

    def build(self, kit):
        module, func = self.builder.split(':')
        getattr(importlib.import_module(module), func)(kit)


P, F, H, M, W, U = ('assets_people', 'assets_friendly', 'assets_hostile', 'assets_munitions', 'assets_world',
                    'assets_pickups')
B = 'assets_harbour'
R = 'assets_frontier'

SPECS = [
    # characters
    Spec('enemy', P + ':enemy', 'character',
         {'ArmL': None, 'ArmR': None, 'LegL': None, 'LegR': None}, ('Hostile accent',),
         ('city', 'valley'), 'Ashen Front fighter'),
    Spec('rescue-soldier', P + ':rescue_soldier', 'character', {'WaveArm': None}, (), ('valley',),
         'Echo recon rescuer'),
    # friendly vehicles
    Spec('boat', F + ':boat', 'vehicle',
         {'Turret': None, 'SingleGun': 'Turret', 'Muzzle': 'SingleGun', 'TwinGunL': 'Turret',
          'TwinGunR': 'Turret', 'MuzzleL': 'TwinGunL', 'MuzzleR': 'TwinGunR', 'SupportRack': None,
          'Radar': None}, (), ('river',), 'Gunboat Marlin'),
    Spec('helicopter', F + ':helicopter', 'vehicle',
         {'Rotor': None, 'TailRotor': None, 'ChinTurret': None, 'HeliMuzzle': 'ChinTurret'}, (),
         ('valley',), 'Rescue helicopter'),
    Spec('bomber', F + ':bomber', 'vehicle',
         {'PropellerL': None, 'PropellerR': None, 'PylonL': None, 'PylonR': None, 'PylonC': None},
         ('Livery',), ('city',), 'Strike bomber'),
    Spec('barge', F + ':barge', 'vehicle', {}, (), ('river',), 'Relief barge Harbor Mercy'),
    Spec('gunship', F + ':gunship', 'vehicle',
         {'Rotor': None, 'TailRotor': None, 'ChinTurret': None, 'HeliMuzzle': 'ChinTurret'}, (),
         ('river',), 'Hornet gunship'),
    Spec('escort-boat', F + ':escort_boat', 'vehicle', {'Turret': None, 'Muzzle': 'Turret'}, (), ('river',),
         'Escort gunboat'),
    # hostile vehicles and emplacements
    Spec('cannon', H + ':cannon', 'vehicle', {'Turret': None, 'Muzzle': 'Turret'}, (), ('river',),
         'Bank gun'),
    Spec('launcher', H + ':launcher', 'vehicle', {}, (), ('river', 'valley'), 'Missile bunker'),
    Spec('mine', H + ':mine', 'prop', {}, (), ('river',), 'Contact mine'),
    Spec('aa-truck', H + ':aa_truck', 'vehicle', {'TruckTurret': None}, (), ('valley',), 'AA truck'),
    Spec('drone', H + ':drone', 'vehicle', {'DroneRotor': None}, (), ('valley',), 'Hostile drone'),
    Spec('aa-nest', H + ':aa_nest', 'vehicle', {'Turret': None, 'MuzzleL': 'Turret', 'MuzzleR': 'Turret'}, (),
         ('city',), 'Rooftop AA nest'),
    Spec('relay-mast', H + ':relay_mast', 'vehicle', {'Dish': None, 'Beacon': None}, ('Beacon light',),
         ('city',), 'Jammer relay mast'),
    Spec('technical', H + ':technical', 'vehicle', {'Turret': None}, (), ('city',), 'Technical'),
    Spec('skiff', H + ':skiff', 'vehicle', {'Turret': None}, (), ('river',), 'Attack skiff'),
    Spec('gate-tower', H + ':gate_tower', 'vehicle', {'Turret': None, 'Muzzle': 'Turret'}, (), ('river',),
         'Gate tower'),
    Spec('lock-gate', H + ':lock_gate', 'vehicle', {'GateL': None, 'GateR': None, 'Generator': None}, (),
         ('river',), 'River lock gate'),
    # munitions
    Spec('missile-friendly', M + ':missile_friendly', 'prop', {}, (), ('river',), 'Friendly missile'),
    Spec('missile-enemy', M + ':missile_enemy', 'prop', {}, (), ('river', 'valley'), 'Hostile missile'),
    Spec('bomb-penetrator', M + ':bomb_penetrator', 'prop', {}, (), ('city',), 'Drill bomb'),
    Spec('bomb-cluster', M + ':bomb_cluster', 'prop', {}, (), ('city',), 'Scatter bomb'),
    Spec('bomb-blast', M + ':bomb_blast', 'prop', {}, (), ('city',), 'Shockwave bomb'),
    Spec('bomb-guided', M + ':bomb_guided', 'prop', {}, (), ('city',), 'Lance bomb'),
    Spec('bomblet', M + ':bomblet', 'prop', {}, (), ('city',), 'Bomblet'),
    # city props
    Spec('roof-tank', W + ':roof_tank', 'prop', {}, (), ('city',), 'Roof water tank'),
    Spec('roof-hvac', W + ':roof_hvac', 'prop', {}, (), ('city',), 'Roof HVAC'),
    Spec('car', W + ':car', 'prop', {}, ('Car paint',), ('city',), 'Parked car'),
    Spec('barricade', W + ':barricade', 'prop', {}, (), ('city',), 'Barricade'),
    Spec('street-tree', W + ':street_tree', 'prop', {}, (), ('city',), 'Street tree'),
    Spec('streetlight', W + ':streetlight', 'prop', {}, (), ('city',), 'Streetlight'),
    # river props
    Spec('fuel-drums', W + ':fuel_drums', 'prop', {}, (), ('river', 'city'), 'Fuel drums'),
    Spec('jungle-tree', W + ':jungle_tree', 'prop', {}, (), ('river', 'valley'), 'Jungle tree'),
    Spec('stilt-house', W + ':stilt_house', 'prop', {}, (), ('river',), 'Stilt house'),
    # nature and rescue props
    Spec('palm', W + ':palm', 'prop', {}, (), ('river', 'city'), 'Palm'),
    Spec('rock', W + ':rock', 'prop', {}, (), ('river', 'valley'), 'Rock'),
    Spec('supply', W + ':supply', 'prop', {}, (), ('valley',), 'Relief crate'),
    Spec('beacon', W + ':beacon', 'prop', {}, (), ('valley',), 'Rescue beacon'),
    # pickups
    Spec('pickup-health', U + ':pickup_health', 'prop', {}, (), ('river',), 'Repair pickup'),
    Spec('pickup-star', U + ':pickup_star', 'prop', {}, (), ('river',), 'Twin-gun pickup'),
    Spec('pickup-gun', U + ':pickup_gun', 'prop', {}, (), ('river',), 'Missile pickup'),
    Spec('pickup-medal', U + ':pickup_medal', 'prop', {}, (), ('river',), 'Medal pickup'),
    # harbour (city chapter): Ashen Front warships, civilian ferry, dockside props
    Spec('patrol-boat', B + ':patrol_boat', 'vehicle', {'Turret': None}, (), ('city',), 'Ashen patrol boat'),
    Spec('missile-boat', B + ':missile_boat', 'vehicle', {}, (), ('city',), 'Ashen missile boat'),
    Spec('frigate', B + ':frigate', 'vehicle', {'Turret': None, 'MuzzleL': 'Turret', 'MuzzleR': 'Turret'}, (),
         ('city',), 'Ashen frigate'),
    Spec('destroyer', B + ':destroyer', 'vehicle', {'TurretF': None, 'TurretA': None}, (), ('city',),
         'Flagship Cinder'),
    Spec('ferry', B + ':ferry', 'vehicle', {}, (), ('city',), 'Harbour ferry'),
    Spec('harbour-crane', B + ':harbour_crane', 'prop', {}, (), ('city',), 'Harbour crane'),
    Spec('buoy', B + ':buoy', 'prop', {}, (), ('city',), 'Channel buoy'),
    Spec('container-stack', B + ':container_stack', 'prop', {}, (), ('city',), 'Container stack'),
    # frontier (river and valley): Ashen Front launchers, drone pad and barracks; riverside and canyon props
    Spec('missile-truck', R + ':missile_truck', 'vehicle', {'Rack': None}, (), ('valley',), 'Missile launcher truck'),
    Spec('missile-site', R + ':missile_site', 'vehicle', {'Rack': None}, (), ('valley',), 'Missile launch site'),
    Spec('drone-pad', R + ':drone_pad', 'vehicle', {}, (), ('valley',), 'Drone launch pad'),
    Spec('barracks-hut', R + ':barracks_hut', 'vehicle', {}, (), ('river', 'valley'), 'Ashen barracks hut'),
    Spec('pine', R + ':pine', 'prop', {}, (), ('river', 'valley'), 'Pine'),
    Spec('log-pile', R + ':log_pile', 'prop', {}, (), ('river',), 'Log pile'),
    Spec('shed', R + ':shed', 'prop', {}, (), ('river',), 'Sawmill shed'),
    Spec('reeds', R + ':reeds', 'prop', {}, (), ('river', 'valley'), 'Reeds'),
    Spec('shrub', R + ':shrub', 'prop', {}, (), ('valley',), 'Dry shrub'),
]

BY_NAME = {s.name: s for s in SPECS}
