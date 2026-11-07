cd "$(dirname "$0")"; mkdir -p out
echo "=== worldtest d"; timeout 300 node worldtest.js out/wt 2>&1 | tail -3
echo "=== worldtest m"; timeout 300 node worldtest.js out/wt m 2>&1 | tail -3
echo "=== wstorytest d"; timeout 300 node wstorytest.js out/ws 2>&1 | tail -2
echo "=== wstorytest m"; timeout 300 node wstorytest.js out/ws m 2>&1 | tail -2
echo "=== w4arttest d"; timeout 300 node w4arttest.js out/wa 2>&1 | tail -2
echo "=== w4arttest m"; timeout 300 node w4arttest.js out/wa m 2>&1 | tail -2
echo "=== aitest"; timeout 300 node aitest.js 2>&1 | grep -E "^FAIL|^MIX|^ERR|ALL PASS|FAILED"
echo "=== aitest2"; timeout 300 node aitest2.js 2>&1 | grep -E "^FAIL|^MIX|^ERR|ALL PASS|FAILED"
echo "=== aitest3"; timeout 300 node aitest3.js 2>&1 | grep -E "^FAIL|^MIX|^ERR|ALL PASS|FAILED"
echo "=== staminatest"; timeout 300 node staminatest.js 2>&1 | tail -2
echo "=== runtest"; timeout 300 node runtest.js 2>&1 | tail -1
echo "=== fxltest"; timeout 300 node fxltest.js 2>&1 | tail -1
echo "=== stagetest"; timeout 600 node stagetest.js 2>&1 | tail -1
echo "=== efxtest"; timeout 300 node efxtest.js 2>&1 | grep -E "FAIL|EFXTEST"
echo "=== efx2test"; timeout 300 node efx2test.js 2>&1 | grep -E "FAIL|EFX2TEST"
for t in afftest traintest train2 countertest walktest difftest coretest contracttest trialtest trialsoak gear settest storytest newenemytest bossmovetest; do
  echo "=== $t"; timeout 600 node $t.js out/tout 2>&1 | tail -6
done
echo "=== channeltest LV=7"; LV=7 timeout 600 node channeltest.js out/tout 2>&1 | tail -6
echo "=== soakd DIFF=0"; DIFF=0 timeout 900 node soakd.js out/tout 2>&1 | tail -10
echo "=== soakd60 DIFF=2"; DIFF=2 timeout 1200 node soakd60.js out/tout 2>&1 | tail -10
echo ALLDONE
