import "@fontsource-variable/geist";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./style.css";

import { initBackground } from "./bg/engine";
import { initBoot } from "./ui/boot";
import { initDock } from "./ui/dock";
import { initChat } from "./ui/chat";
import { initStream } from "./ui/stream";

initBackground();
initStream();
initDock();
initChat();
initBoot();
