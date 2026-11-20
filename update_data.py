
import urllib.request
import json
import re
from html.parser import HTMLParser
from html import unescape
from datetime import datetime, timezone, timedelta

BASE = "https://www.bleague.jp"
HEADERS = {"User-Agent": "Mozilla/5.0"}
JST = timezone(timedelta(hours=9))


def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        value = data.strip()
        if value:
            self.parts.append(value)


def text_content(html):
    parser = Parser()
    parser.feed(html)
    return parser.parts


def clean(value):
    return unescape(re.sub(r"<[^>]+>", "", value)).strip()


def get_schedule():
    html = fetch(BASE + "/schedule/")
    games = []

    pattern = re.compile(
        r'<li class="list-item" id="([^"]+)">(.*?)</li>',
        re.S
    )

    for match in pattern.finditer(html):
        game_id = match.group(1)
        card = match.group(2)

        teams = re.findall(
            r'<span class="team-name">(.*?)</span>',
            card,
            re.S
        )

        if len(teams) < 2:
            continue

        info = text_content(card)

        games.append({
            "id": game_id,
            "home": clean(teams[0]),
            "away": clean(teams[1]),
            "info": info,
            "detail": BASE + "/game_detail/?ScheduleKey=" + game_id
        })

    return games


def get_standings():
    html = fetch(BASE + "/standings/?tab=1&year=2026")

    tables = re.findall(
        r'<h3[^>]*>(東地区|西地区)</h3>.*?'
        r'<table[^>]*table-standings[^>]*>(.*?)</table>',
        html,
        re.S
    )

    result = {}

    for area, table_html in tables:
        teams = []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.S)

        for row in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)

            if len(cells) < 15:
                continue

            team_name = re.search(
                r'<span class="sp-dn team-name-line">(.*?)</span>',
                cells[1],
                re.S
            )

            if not team_name:
                team_name = re.search(
                    r'<span class="pc-tab-dn">(.*?)</span>',
                    cells[1],
                    re.S
                )

            teams.append({
                "rank": clean(cells[0]),
                "team": clean(team_name.group(1)) if team_name else clean(cells[1]),
                "wins": clean(cells[2]),
                "losses": clean(cells[3]),
                "winRate": clean(cells[4]),
                "gamesBehind": clean(cells[5]),
                "points": clean(cells[6]),
                "pointsAgainst": clean(cells[7]),
                "pointDifference": clean(cells[8]),
                "home": clean(cells[9]),
                "away": clean(cells[10]),
                "last5": clean(cells[11]),
                "streak": clean(cells[12]),
                "gamesPlayed": clean(cells[13]),
                "completionRate": clean(cells[14])
            })

        result[area] = teams

    return result


def main():
    print("B.PREMIERの公式データを取得しています...")

    schedule = get_schedule()
    standings = get_standings()

    result = {
        "updated": datetime.now(JST).isoformat(),
        "season": "2026-27",
        "league": "B.PREMIER",
        "schedule": schedule,
        "standings": standings,
        "source": BASE
    }

    with open("data.json", "w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)

    print("取得完了！")
    print("試合データ:", len(schedule), "件")
    print("東地区:", len(standings.get("東地区", [])), "チーム")
    print("西地区:", len(standings.get("西地区", [])), "チーム")
    print("data.jsonを更新しました。")


if __name__ == "__main__":
    main()
