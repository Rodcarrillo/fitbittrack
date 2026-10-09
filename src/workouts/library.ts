import type { Equipment, ExerciseDef, Muscle } from './types';

const ex = (id: string, name: string, muscle: Muscle, equipment: Equipment, restSec = 90): ExerciseDef => ({ id, name, muscle, equipment, restSec });

/** Built-in exercise library. Custom exercises are stored alongside in WorkoutData. */
export const EXERCISE_LIBRARY: ExerciseDef[] = [
  // chest
  ex('bench-press', 'Bench Press', 'chest', 'barbell', 150),
  ex('incline-bench', 'Incline Bench Press', 'chest', 'barbell', 120),
  ex('incline-db-press', 'Incline Dumbbell Press', 'chest', 'dumbbell', 120),
  ex('db-bench', 'Dumbbell Bench Press', 'chest', 'dumbbell', 120),
  ex('chest-fly-cable', 'Cable Fly', 'chest', 'cable', 75),
  ex('pec-deck', 'Pec Deck', 'chest', 'machine', 75),
  ex('chest-press-machine', 'Chest Press', 'chest', 'machine', 90),
  ex('push-up', 'Push-Up', 'chest', 'bodyweight', 60),
  ex('dips', 'Chest Dips', 'chest', 'bodyweight', 90),
  ex('smith-incline', 'Smith Incline Press', 'chest', 'smith', 120),
  // back
  ex('deadlift', 'Deadlift', 'back', 'barbell', 180),
  ex('barbell-row', 'Barbell Row', 'back', 'barbell', 120),
  ex('pull-up', 'Pull-Up', 'back', 'bodyweight', 120),
  ex('lat-pulldown', 'Lat Pulldown', 'back', 'cable', 90),
  ex('seated-row', 'Seated Cable Row', 'back', 'cable', 90),
  ex('db-row', 'One-Arm Dumbbell Row', 'back', 'dumbbell', 90),
  ex('t-bar-row', 'T-Bar Row', 'back', 'machine', 120),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back', 'cable', 60),
  ex('back-extension', 'Back Extension', 'back', 'bodyweight', 60),
  // shoulders
  ex('ohp', 'Overhead Press', 'shoulders', 'barbell', 150),
  ex('db-shoulder-press', 'Shoulder Press', 'shoulders', 'dumbbell', 120),
  ex('lateral-raise', 'Lateral Raise', 'shoulders', 'dumbbell', 60),
  ex('cable-lateral', 'Cable Lateral Raise', 'shoulders', 'cable', 60),
  ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', 'machine', 60),
  ex('face-pull', 'Face Pull', 'shoulders', 'cable', 60),
  ex('arnold-press', 'Arnold Press', 'shoulders', 'dumbbell', 90),
  // biceps
  ex('barbell-curl', 'Barbell Curl', 'biceps', 'barbell', 75),
  ex('db-curl', 'Dumbbell Curl', 'biceps', 'dumbbell', 60),
  ex('hammer-curl', 'Hammer Curl', 'biceps', 'dumbbell', 60),
  ex('preacher-curl', 'Preacher Curl', 'biceps', 'machine', 60),
  ex('cable-curl', 'Cable Curl', 'biceps', 'cable', 60),
  // triceps
  ex('triceps-pushdown', 'Triceps Pushdown', 'triceps', 'cable', 60),
  ex('overhead-ext', 'Overhead Triceps Extension', 'triceps', 'cable', 60),
  ex('skull-crusher', 'Skull Crusher', 'triceps', 'barbell', 75),
  ex('close-grip-bench', 'Close-Grip Bench Press', 'triceps', 'barbell', 120),
  ex('triceps-dip', 'Triceps Dip', 'triceps', 'bodyweight', 75),
  // legs
  ex('squat', 'Squat', 'legs', 'barbell', 180),
  ex('front-squat', 'Front Squat', 'legs', 'barbell', 150),
  ex('leg-press', 'Leg Press', 'legs', 'machine', 120),
  ex('hack-squat', 'Hack Squat', 'legs', 'machine', 120),
  ex('leg-extension', 'Leg Extension', 'legs', 'machine', 60),
  ex('leg-curl', 'Lying Leg Curl', 'legs', 'machine', 60),
  ex('bulgarian-split', 'Bulgarian Split Squat', 'legs', 'dumbbell', 90),
  ex('walking-lunge', 'Walking Lunge', 'legs', 'dumbbell', 90),
  ex('smith-squat', 'Smith Squat', 'legs', 'smith', 120),
  // glutes
  ex('rdl', 'Romanian Deadlift', 'glutes', 'barbell', 120),
  ex('hip-thrust', 'Hip Thrust', 'glutes', 'barbell', 120),
  ex('glute-kickback', 'Cable Glute Kickback', 'glutes', 'cable', 60),
  ex('hip-abduction', 'Hip Abduction', 'glutes', 'machine', 60),
  // core
  ex('plank', 'Plank (sec)', 'core', 'bodyweight', 60),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight', 60),
  ex('cable-crunch', 'Cable Crunch', 'core', 'cable', 60),
  ex('ab-wheel', 'Ab Wheel Rollout', 'core', 'other', 60),
  ex('russian-twist', 'Russian Twist', 'core', 'bodyweight', 45),
  // calves
  ex('standing-calf', 'Standing Calf Raise', 'calves', 'machine', 60),
  ex('seated-calf', 'Seated Calf Raise', 'calves', 'machine', 60),
  // forearms
  ex('wrist-curl', 'Wrist Curl', 'forearms', 'dumbbell', 45),
  ex('farmer-carry', "Farmer's Carry", 'forearms', 'dumbbell', 90),
];
