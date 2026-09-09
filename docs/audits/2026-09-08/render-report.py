import json,re,html,pathlib
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether, Flowable
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT=pathlib.Path.cwd();BASE=ROOT/'docs/audits/2026-09-08';OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Arial','/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold','/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Italic','/System/Library/Fonts/Supplemental/Arial Italic.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial-Italic',boldItalic='Arial-Bold')
INK=colors.HexColor('#17241e');MUTED=colors.HexColor('#526158');LINE=colors.HexColor('#d6ded6');ACCENT=colors.HexColor('#164d40');PALE=colors.HexColor('#eff3ed')
W,H=595.28,841.89;M=48;CW=W-2*M
styles={
'body':ParagraphStyle('body',fontName='Arial',fontSize=10.2,leading=15.3,textColor=INK,spaceAfter=10,splitLongWords=True),
'h2':ParagraphStyle('h2',fontName='Arial-Bold',fontSize=23,leading=28,textColor=INK,spaceAfter=19,keepWithNext=True),
'h3':ParagraphStyle('h3',fontName='Arial-Bold',fontSize=13.5,leading=18,textColor=INK,spaceBefore=16,spaceAfter=9,keepWithNext=True),
'caption':ParagraphStyle('caption',fontName='Arial',fontSize=8.3,leading=12,textColor=MUTED,spaceBefore=10,spaceAfter=15),
'table':ParagraphStyle('table',fontName='Arial',fontSize=8.1,leading=11.6,textColor=INK,splitLongWords=True),
'bullet':ParagraphStyle('bullet',fontName='Arial',fontSize=10.2,leading=15.3,textColor=INK,leftIndent=14,firstLineIndent=-11,spaceAfter=7),
'cover':ParagraphStyle('cover',fontName='Arial-Bold',fontSize=38,leading=43,textColor=INK,spaceAfter=24),
'deck':ParagraphStyle('deck',fontName='Arial',fontSize=15,leading=23,textColor=MUTED,spaceAfter=20),
'kicker':ParagraphStyle('kicker',fontName='Arial-Bold',fontSize=10,leading=15,textColor=ACCENT,spaceAfter=22),
}
def norm(s):
 return str(s).replace('\u2014',' - ').replace('\u2013','-').replace('\u2011','-').replace('\u2212','-')
def esc(s):return html.escape(norm(s))
def inline(tokens):
 out=''
 for t in tokens or []:
  kind=t.get('type');text=t.get('text','')
  if kind=='strong':out+='<b>'+inline(t.get('tokens'))+'</b>'
  elif kind=='em':out+='<i>'+inline(t.get('tokens'))+'</i>'
  elif kind=='codespan':out+='<font face="Courier" size="8.7">'+esc(text)+'</font>'
  elif kind=='link':
   href=t.get('href','');label=inline(t.get('tokens')) or esc(text)
   if href.startswith(('https://','http://')):out+=f'<link href="{html.escape(href,quote=True)}" color="#164d40">{label}</link>'
   else:out+=label
  elif kind=='br':out+='<br/>'
  elif kind=='text':out+=inline(t.get('tokens')) if t.get('tokens') else esc(text)
  elif kind=='escape':out+=esc(text)
  elif kind=='del':out+='<strike>'+inline(t.get('tokens'))+'</strike>'
  else:out+=esc(text)
 return out
class Screenshot(Flowable):
 def __init__(self,path):
  Flowable.__init__(self);self.image=ImageReader(str(path));self.iw,self.ih=self.image.getSize();self.crop=min(self.ih,852 if self.iw==393 else 568 if self.iw==320 else self.ih)
  self.width=min(300,self.iw*0.72);self.height=self.crop*self.width/self.iw
  if self.height>440:self.width*=440/self.height;self.height=440
  self.hAlign='CENTER'
 def draw(self):
  c=self.canv;c.saveState();p=c.beginPath();p.rect(0,0,self.width,self.height);c.clipPath(p,stroke=0,fill=0)
  scaledh=self.ih*self.width/self.iw;c.drawImage(self.image,0,self.height-scaledh,width=self.width,height=scaledh,mask='auto');c.restoreState();c.setStrokeColor(LINE);c.rect(0,0,self.width,self.height,stroke=1,fill=0)
class ReportDoc(BaseDocTemplate):
 def afterFlowable(self,f):
  if isinstance(f,Paragraph) and f.style.name=='h2' and f.getPlainText()!='Contents':
   key='p'+str(self.page)+'-'+str(len(f.getPlainText()));self.canv.bookmarkPage(key);self.canv.addOutlineEntry(f.getPlainText(),key,level=0)
   self.notify('TOCEntry',(0,f.getPlainText(),self.page,key))
def page(c,d):
 c.saveState()
 if d.page>1:
  c.setFont('Arial-Bold',8);c.setFillColor(MUTED);c.drawString(M,H-27,'MAINPOT / APP REVIEW & UX CASE STUDY');c.setStrokeColor(LINE);c.line(M,H-35,W-M,H-35)
 c.setStrokeColor(LINE);c.line(M,38,W-M,38);c.setFillColor(MUTED);c.setFont('Arial',8);c.drawString(M,24,'September 8, 2026 | Local working tree | Synthetic data');c.drawRightString(W-M,24,str(d.page));c.restoreState()
doc=ReportDoc(str(OUT/'mainpot-ui-ux-case-study-2026-09-08.pdf'),pagesize=(W,H),leftMargin=M,rightMargin=M,topMargin=53,bottomMargin=52,title='Mainpot: Whole-app review and UI/UX case study',author='Codex',subject='Evidence-based local product and UX audit')
doc.addPageTemplates(PageTemplate(id='normal',frames=[Frame(M,52,CW,H-105,id='main',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=page))
story=[Spacer(1,35),Paragraph('PRODUCT REVIEW / SEPTEMBER 2026',styles['kicker']),Paragraph('Mainpot',styles['cover']),Paragraph('Whole-app review<br/>and UI/UX case study',styles['cover']),Paragraph('A clear game-night journey, with important gaps in identity continuity, audit integrity and money-entry validation.',styles['deck']),Spacer(1,18)]
metric=Table([[Paragraph('<b>105</b><br/>unit tests passed',styles['deck']),Paragraph('<b>52</b><br/>browser tests passed',styles['deck']),Paragraph('<b>60</b><br/>screen states scanned',styles['deck'])]],colWidths=[CW/3]*3)
metric.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.6,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),14),('TOPPADDING',(0,0),(-1,-1),16),('BOTTOMPADDING',(0,0),(-1,-1),8)]));story+=[metric,Spacer(1,28),Paragraph('<b>Evidence boundary</b><br/>Current local working tree, production builds, disposable Supabase, synthetic accounts and games. No production deployment or physical-device certification.',styles['body']),Paragraph('Prepared for Anurag. Includes reproduced defects, a screen-by-screen evaluation, implementation acceptance criteria, and a proposed formative research study.',styles['body']),PageBreak(),Paragraph('Contents',styles['h2'])]
toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc',fontName='Arial',fontSize=11,leading=17,spaceBefore=9,textColor=INK,leftIndent=0,firstLineIndent=0)];story+=[toc,PageBreak()]
tokens=json.loads((BASE/'evidence/report-tokens.json').read_text())
first=True
for t in tokens:
 kind=t['type']
 if kind=='space':continue
 if kind=='heading':
  depth=t['depth']
  if depth==1:continue
  if depth==2:story.append(PageBreak())
  story.append(Paragraph(inline(t.get('tokens')),'h2' in styles and styles['h2'] if depth==2 else styles['h3']))
 elif kind=='paragraph':
  images=[x for x in t.get('tokens',[]) if x['type']=='image']
  if images:
   for im in images:
    path=BASE/im['href'];fig=Screenshot(path);caption=Paragraph(esc(im.get('text',''))+'<br/><i>Viewport excerpt. Full-resolution image: '+esc(im['href'])+'</i>',styles['caption']);story.append(KeepTogether([Spacer(1,7),fig,caption]))
  else:story.append(Paragraph(inline(t.get('tokens')),styles['body']))
 elif kind=='list':
  for index,item in enumerate(t['items']):
   text=' '.join(inline(x.get('tokens')) or esc(x.get('text','')) for x in item.get('tokens',[]) if x.get('type')!='space');prefix=f'{index+1}.' if t.get('ordered') else '&#8226;';story.append(Paragraph(prefix+' '+text,styles['bullet']))
 elif kind=='table':
  head=t['header'];n=len(head);rows=[[Paragraph('<b>'+inline(x.get('tokens'))+'</b>',styles['table']) for x in head]]
  rows += [[Paragraph(inline(x.get('tokens')),styles['table']) for x in row] for row in t['rows']]
  widths=[CW/n]*n
  if n==4:widths=[CW*.14,CW*.30,CW*.22,CW*.34]
  if n==2:widths=[CW*.40,CW*.60]
  table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f8faf7')]),('GRID',(0,0),(-1,-1),.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));story.extend([table,Spacer(1,14)])
 elif kind=='code':story.append(Paragraph(esc(t.get('text','')).replace('\n','<br/>'),styles['body']))
doc.multiBuild(story)
print(OUT/'mainpot-ui-ux-case-study-2026-09-08.pdf')
