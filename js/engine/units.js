// Physical/engineering constants (CODATA 2018 recommended values; SI exact where defined)
// and unit conversion tables.

export const CONSTANTS = {
  pi: { sym: 'π', name: 'Pi', value: Math.PI, unit: '' },
  e: { sym: 'e', name: "Euler's number", value: Math.E, unit: '' },
  phi: { sym: 'φ', name: 'Golden ratio', value: (1 + Math.sqrt(5)) / 2, unit: '', group: 'Math' },
  c: { sym: 'c', name: 'Speed of light', value: 299792458, unit: 'm/s', group: 'Universal' },
  G: { sym: 'G', name: 'Gravitational constant', value: 6.6743e-11, unit: 'm³/(kg·s²)', group: 'Universal' },
  h: { sym: 'h', name: 'Planck constant', value: 6.62607015e-34, unit: 'J·s', group: 'Universal' },
  hbar: { sym: 'ħ', name: 'Reduced Planck constant', value: 1.054571817e-34, unit: 'J·s', group: 'Universal' },
  g: { sym: 'g', name: 'Standard gravity', value: 9.80665, unit: 'm/s²', group: 'Engineering' },
  gft: { sym: 'g', name: 'Standard gravity (imperial)', value: 32.1740486, unit: 'ft/s²', group: 'Engineering' },
  atm: { sym: 'atm', name: 'Standard atmosphere', value: 101325, unit: 'Pa', group: 'Engineering' },
  psi: { sym: 'psi', name: 'Pound per sq inch', value: 6894.757293168, unit: 'Pa', group: 'Engineering' },
  rhow: { sym: 'ρw', name: 'Density of water (4 °C)', value: 999.97, unit: 'kg/m³', group: 'Engineering' },
  steelE: { sym: 'Es', name: "Young's modulus, steel (typ.)", value: 200e9, unit: 'Pa', group: 'Engineering' },
  qe: { sym: 'e', name: 'Elementary charge', value: 1.602176634e-19, unit: 'C', group: 'Electromagnetic' },
  eps0: { sym: 'ε₀', name: 'Vacuum permittivity', value: 8.8541878128e-12, unit: 'F/m', group: 'Electromagnetic' },
  mu0: { sym: 'μ₀', name: 'Vacuum permeability', value: 1.25663706212e-6, unit: 'N/A²', group: 'Electromagnetic' },
  ke: { sym: 'kₑ', name: 'Coulomb constant', value: 8.9875517923e9, unit: 'N·m²/C²', group: 'Electromagnetic' },
  me: { sym: 'mₑ', name: 'Electron mass', value: 9.1093837015e-31, unit: 'kg', group: 'Atomic' },
  mp: { sym: 'mₚ', name: 'Proton mass', value: 1.67262192369e-27, unit: 'kg', group: 'Atomic' },
  mn: { sym: 'mₙ', name: 'Neutron mass', value: 1.67492749804e-27, unit: 'kg', group: 'Atomic' },
  u: { sym: 'u', name: 'Atomic mass unit', value: 1.6605390666e-27, unit: 'kg', group: 'Atomic' },
  a0: { sym: 'a₀', name: 'Bohr radius', value: 5.29177210903e-11, unit: 'm', group: 'Atomic' },
  Rinf: { sym: 'R∞', name: 'Rydberg constant', value: 10973731.56816, unit: '1/m', group: 'Atomic' },
  alpha: { sym: 'α', name: 'Fine-structure constant', value: 7.2973525693e-3, unit: '', group: 'Atomic' },
  NA: { sym: 'Nₐ', name: 'Avogadro constant', value: 6.02214076e23, unit: '1/mol', group: 'Chemistry' },
  kB: { sym: 'k', name: 'Boltzmann constant', value: 1.380649e-23, unit: 'J/K', group: 'Chemistry' },
  R: { sym: 'R', name: 'Molar gas constant', value: 8.314462618, unit: 'J/(mol·K)', group: 'Chemistry' },
  F: { sym: 'F', name: 'Faraday constant', value: 96485.33212, unit: 'C/mol', group: 'Chemistry' },
  sigma: { sym: 'σ', name: 'Stefan–Boltzmann constant', value: 5.670374419e-8, unit: 'W/(m²·K⁴)', group: 'Chemistry' },
  T0: { sym: 'T₀', name: '0 °C in kelvin', value: 273.15, unit: 'K', group: 'Chemistry' },
  Vm: { sym: 'Vm', name: 'Molar volume, ideal gas (0 °C, 1 atm)', value: 22.41396954e-3, unit: 'm³/mol', group: 'Chemistry' },
};

// Linear conversions: factor to base unit.
export const UNITS = {
  Length: {
    base: 'm',
    units: {
      mm: 0.001, cm: 0.01, m: 1, km: 1000,
      in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
    },
  },
  Area: {
    base: 'm²',
    units: {
      'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, ha: 1e4, 'km²': 1e6,
      'in²': 0.00064516, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224, 'mi²': 2589988.110336,
    },
  },
  Volume: {
    base: 'L',
    units: {
      mL: 0.001, L: 1, 'm³': 1000,
      'in³': 0.016387064, 'ft³': 28.316846592, 'yd³': 764.554857984,
      'US gal': 3.785411784, 'Imp gal': 4.54609, 'US qt': 0.946352946, 'US fl oz': 0.0295735295625,
    },
  },
  Weight: {
    base: 'kg',
    units: {
      g: 0.001, kg: 1, tonne: 1000,
      oz: 0.028349523125, lb: 0.45359237, 'short ton': 907.18474, 'long ton': 1016.0469088,
    },
  },
  Temperature: {
    base: 'K',
    units: { '°C': 'C', '°F': 'F', K: 'K' },
  },
};

export function convert(category, value, from, to) {
  if (category === 'Temperature') {
    let k;
    if (from === '°C') k = value + 273.15;
    else if (from === '°F') k = ((value - 32) * 5) / 9 + 273.15;
    else k = value;
    if (to === '°C') return k - 273.15;
    if (to === '°F') return ((k - 273.15) * 9) / 5 + 32;
    return k;
  }
  const u = UNITS[category].units;
  return (value * u[from]) / u[to];
}
