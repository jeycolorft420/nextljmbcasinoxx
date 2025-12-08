const crypto = require('crypto');

console.log(" Verifying Randomness with crypto.randomInt...");

const iterations = 100000;
const slots = 12;
const bins = new Array(slots).fill(0);

for (let i = 0; i < iterations; i++) {
    const winnerIndex = crypto.randomInt(0, slots);
    bins[winnerIndex]++;
}

console.log(`Ran ${iterations} iterations for ${slots} slots.`);
const expected = iterations / slots;
console.log(`Expected per slot: ~${expected.toFixed(0)}`);

let maxDev = 0;
bins.forEach((count, i) => {
    const dev = Math.abs(count - expected) / expected * 100;
    if (dev > maxDev) maxDev = dev;
    // console.log(`Slot ${i+1}: ${count} (${dev.toFixed(2)}% dev)`);
});

console.log(`Max Deviation: ${maxDev.toFixed(2)}%`);

if (maxDev < 2.0) {
    console.log("✅ Randomness is UNBIASED and fair.");
} else {
    console.log("⚠️ Randomness might be biased (check sample size).");
}
