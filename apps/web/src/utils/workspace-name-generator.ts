import { POKEMON_NAMES } from '@/constants/pokemon-names';

function getRandomPokemon(): string {
  return POKEMON_NAMES[Math.floor(Math.random() * POKEMON_NAMES.length)];
}

function generateRandomSuffix(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateWorkspaceName(existingNames: string[], prefix: string): string {
  const normalize = (name: string) => name.toLowerCase();
  const existingSet = new Set(existingNames.map(normalize));
  
  const isAvailable = (name: string) => !existingSet.has(normalize(name));
  
  const shuffledPokemon = [...POKEMON_NAMES].sort(() => Math.random() - 0.5);
  
  for (const pokemon of shuffledPokemon) {
    const candidate = `${prefix}/${pokemon}`;
    if (isAvailable(candidate)) {
      return candidate;
    }
  }
  
  for (const pokemon of shuffledPokemon) {
    for (let v = 2; v <= 9; v++) {
      const candidate = `${prefix}/${pokemon}-v${v}`;
      if (isAvailable(candidate)) {
        return candidate;
      }
    }
  }
  
  for (let i = 0; i < 50; i++) {
    const pokemon1 = getRandomPokemon();
    const pokemon2 = getRandomPokemon();
    if (pokemon1 !== pokemon2) {
      const candidate = `${prefix}/${pokemon1}-${pokemon2}`;
      if (isAvailable(candidate)) {
        return candidate;
      }
    }
  }
  
  const basePokemon = getRandomPokemon();
  const suffix = generateRandomSuffix();
  return `${prefix}/${basePokemon}-${suffix}`;
}

export function extractRepoPrefix(projectName: string): string {
  if (projectName.includes('/')) {
    const parts = projectName.split('/');
    return parts[0];
  }
  
  return projectName;
}
