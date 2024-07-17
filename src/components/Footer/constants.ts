import { t } from "@lingui/macro";
import "./Footer.css";
import xIcon from "img/ic_x.svg";
import discordIcon from "img/ic_discord.svg";
import telegramIcon from "img/ic_telegram.svg";
import githubIcon from "img/ic_github.svg";
import substackIcon from "img/ic_substack.svg";

type Link = {
  label: string;
  link: string;
  external?: boolean;
  isAppLink?: boolean;
};

type SocialLink = {
  link: string;
  name: string;
  icon: string;
};
