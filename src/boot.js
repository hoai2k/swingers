// The game's entry point, behind the shared invite door (../gate/gate.js, a
// copy of hoai2k.github.io's gate/loader.js, which loads the shared door). The door is
// off on localhost (append ?gatetest=1 to see it); once through, the game itself
// is imported, which starts it.
import { openGate } from '../gate/gate.js';

void openGate({
  title: 'Swingers',
  game: 'swingers',
  blurb: 'This game is for friends of Hoai Nguyen. Use your invite link, or enter your code below.',
  // Still a prototype: the public-access switch for the finished games does
  // not open it. Only an invite pass does.
  ignorePublicAccess: true,
  // ...unless public-access.json beside index.html says
  // { "followPublicAccess": true }: then it follows the switch like the others.
  accessFile: 'public-access.json',
}).then(() => import('./main.js'));
