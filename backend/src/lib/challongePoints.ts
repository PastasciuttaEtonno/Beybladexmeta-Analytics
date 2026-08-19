export function calculateChallongePoints(rank: number | null, total: number | null): number {
  if (!rank || !total) return 0;

  if (total >= 49) {
    if (rank === 1) return 400;
    if (rank === 2) return 280;
    if (rank === 3) return 160;
    if (rank === 4) return 120;
    if (rank >= 5 && rank <= 8) return 90;
    if (rank >= 9 && rank <= 12) return 65;
    if (rank >= 13 && rank <= 16) return 50;
    if (rank >= 17 && rank <= 24) return 40;
    if (rank >= 25 && rank <= 32) return 30;
    if (rank >= 33 && rank <= 48) return 15;
    if (rank >= 49) return 10;
  } else if (total >= 33) {
    if (rank === 1) return 350;
    if (rank === 2) return 240;
    if (rank === 3) return 140;
    if (rank === 4) return 110;
    if (rank >= 5 && rank <= 8) return 80;
    if (rank >= 9 && rank <= 12) return 55;
    if (rank >= 13 && rank <= 16) return 40;
    if (rank >= 17 && rank <= 24) return 30;
    if (rank >= 25 && rank <= 32) return 15;
    if (rank >= 33) return 10;
  } else if (total >= 25) {
    if (rank === 1) return 300;
    if (rank === 2) return 200;
    if (rank === 3) return 120;
    if (rank === 4) return 90;
    if (rank >= 5 && rank <= 8) return 70;
    if (rank >= 9 && rank <= 12) return 45;
    if (rank >= 13 && rank <= 16) return 30;
    if (rank >= 17 && rank <= 24) return 15;
    if (rank >= 25) return 10;
  } else if (total >= 17) {
    if (rank === 1) return 250;
    if (rank === 2) return 160;
    if (rank === 3) return 100;
    if (rank === 4) return 80;
    if (rank >= 5 && rank <= 8) return 60;
    if (rank >= 9 && rank <= 12) return 30;
    if (rank >= 13 && rank <= 16) return 15;
    if (rank >= 17) return 10;
  } else if (total >= 13) {
    if (rank === 1) return 200;
    if (rank === 2) return 120;
    if (rank === 3) return 80;
    if (rank === 4) return 60;
    if (rank >= 5 && rank <= 8) return 30;
    if (rank >= 9 && rank <= 12) return 15;
    if (rank >= 13) return 10;
  } else if (total >= 8) {
    if (rank === 1) return 150;
    if (rank === 2) return 80;
    if (rank === 3) return 60;
    if (rank === 4) return 40;
    if (rank >= 5 && rank <= 8) return 20;
    if (rank >= 9) return 10;
  } else if (total >= 6) {
    if (rank === 1) return 100;
    if (rank === 2) return 70;
    if (rank === 3) return 50;
    if (rank === 4) return 30;
    if (rank >= 5) return 10;
  }

  return 0;
}
