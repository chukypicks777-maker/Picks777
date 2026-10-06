export function isKnownFixture(match) {
  return ['homeTeam', 'awayTeam'].every(side => {
    const team = match?.[side];
    return team?.name && !/^(?:tbd|tba|por definir|por confirmar|to be determined)$/i.test(team.name.trim())
      && !/^(?:(?:atp|wta)-)?0$/.test(String(team.id));
  });
}

export function isUpcomingFixture(match, now = Date.now()) {
  return isKnownFixture(match) && match.status === 'SCHEDULED' && Date.parse(match.kickoff) > now;
}
