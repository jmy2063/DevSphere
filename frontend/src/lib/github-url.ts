export function parseGithubPrUrl(value:string):{owner:string;repo:string;pullNumber:number}{
  let url:URL;
  try{url=new URL(value.trim())}catch{throw new Error('GitHub PR 주소를 입력해주세요.')}
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password)throw new Error('https://github.com의 PR 주소를 입력해주세요.');
  const match=url.pathname.match(/^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\/pull\/(\d+)(?:\/(?:files|commits|checks))?\/?$/);
  if(!match)throw new Error('PR 주소 형식: https://github.com/owner/repository/pull/123');
  const pullNumber=Number(match[3]);
  if(!Number.isInteger(pullNumber)||pullNumber<1||pullNumber>2147483647)throw new Error('PR 번호 범위를 확인해주세요.');
  return {owner:match[1],repo:match[2],pullNumber};
}
