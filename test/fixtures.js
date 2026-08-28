// Hand-built fixtures with known, independently-worked expected values.
// INVARIANT: each recipe's ingredient costs sum to costPerServing * servings,
// so shopping-list totals can be asserted against plan cost.
// Garlic appears in both lugaw and monggo, to exercise ingredient merging.

export const THREE_RECIPES = [
  {
    id: 'lugaw',
    name: 'Lugaw',
    servings: 4,
    costPerServing: 10, // batch = 40
    maxPortions: 3,
    nutritionPerServing: { calories: 200, protein: 5, iron: 1, vitaminA: 10 },
    ingredients: [
      { name: 'Rice', quantity: 200, unit: 'g', cost: 24 },
      { name: 'Ginger', quantity: 20, unit: 'g', cost: 6 },
      { name: 'Garlic', quantity: 15, unit: 'g', cost: 10 }
    ]
  },
  {
    id: 'ginisang-monggo',
    name: 'Ginisang Monggo',
    servings: 4,
    costPerServing: 20, // batch = 80
    maxPortions: 3,
    nutritionPerServing: { calories: 300, protein: 18, iron: 3, vitaminA: 40 },
    ingredients: [
      { name: 'Monggo', quantity: 250, unit: 'g', cost: 35 },
      { name: 'Malunggay', quantity: 100, unit: 'g', cost: 15 },
      { name: 'Garlic', quantity: 15, unit: 'g', cost: 10 },
      { name: 'Cooking oil', quantity: 30, unit: 'ml', cost: 20 }
    ]
  },
  {
    id: 'adobong-manok',
    name: 'Adobong Manok',
    servings: 4,
    costPerServing: 45, // batch = 180
    maxPortions: 2,
    nutritionPerServing: { calories: 400, protein: 30, iron: 2, vitaminA: 20 },
    ingredients: [
      { name: 'Chicken', quantity: 500, unit: 'g', cost: 140 },
      { name: 'Soy sauce', quantity: 60, unit: 'ml', cost: 15 },
      { name: 'Vinegar', quantity: 60, unit: 'ml', cost: 15 },
      { name: 'Garlic', quantity: 20, unit: 'g', cost: 10 }
    ]
  }
];
