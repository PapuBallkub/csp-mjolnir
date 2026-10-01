/**
 * server/src/pipeline/extraction/references/technologies.js
 *
 * The starter vocabulary: one entry per technology, with the other ways TORs
 * write it. Seeded as `confirmed` by `npm run technologies:seed`. Names the
 * extraction meets that aren't here become `new` entries for a person to merge
 * or confirm (ADR 0014), so this list only needs the common ones.
 *
 * Aliases are matched after lower-casing and collapsing spaces; the name
 * itself always matches, so it isn't repeated as an alias.
 */

export const STARTER_TECHNOLOGIES = [
  // Databases
  { name: 'PostgreSQL', category: 'database', aliases: ['Postgres', 'PgSQL', 'Postgre SQL'] },
  { name: 'MySQL', category: 'database', aliases: ['My SQL'] },
  { name: 'MariaDB', category: 'database', aliases: ['Maria DB'] },
  { name: 'Microsoft SQL Server', category: 'database', aliases: ['SQL Server', 'MS SQL', 'MSSQL', 'MS SQL Server'] },
  { name: 'Oracle Database', category: 'database', aliases: ['Oracle', 'Oracle DB', 'Oracle RDBMS'] },
  { name: 'MongoDB', category: 'database', aliases: ['Mongo DB', 'Mongo'] },
  { name: 'Redis', category: 'database', aliases: [] },
  { name: 'Elasticsearch', category: 'database', aliases: ['Elastic Search', 'ELK'] },
  { name: 'SQLite', category: 'database', aliases: [] },

  // Operating systems
  { name: 'Windows Server', category: 'os', aliases: ['Microsoft Windows Server', 'Win Server', 'MS Windows Server'] },
  { name: 'Windows', category: 'os', aliases: ['Microsoft Windows', 'MS Windows'] },
  { name: 'Red Hat Enterprise Linux', category: 'os', aliases: ['RHEL', 'Red Hat Linux', 'Redhat'] },
  { name: 'Ubuntu', category: 'os', aliases: ['Ubuntu Server', 'Ubuntu Linux'] },
  { name: 'CentOS', category: 'os', aliases: ['Cent OS'] },
  { name: 'Linux', category: 'os', aliases: [] },

  // Virtualization and containers
  { name: 'VMware vSphere', category: 'virtualization', aliases: ['vSphere', 'VMware', 'VMware ESXi', 'ESXi'] },
  { name: 'Microsoft Hyper-V', category: 'virtualization', aliases: ['Hyper-V', 'HyperV'] },
  { name: 'Nutanix', category: 'virtualization', aliases: ['Nutanix AHV'] },
  { name: 'Kubernetes', category: 'container', aliases: ['K8s', 'K8S'] },
  { name: 'Docker', category: 'container', aliases: ['Docker Engine'] },
  { name: 'Red Hat OpenShift', category: 'container', aliases: ['OpenShift', 'Open Shift'] },

  // Web servers
  { name: 'NGINX', category: 'web-server', aliases: ['Nginx'] },
  { name: 'NGINX Plus', category: 'web-server', aliases: [] },
  { name: 'Apache HTTP Server', category: 'web-server', aliases: ['Apache', 'Apache HTTPD', 'httpd'] },
  { name: 'Apache Tomcat', category: 'web-server', aliases: ['Tomcat'] },
  { name: 'Microsoft IIS', category: 'web-server', aliases: ['IIS', 'Internet Information Services'] },

  // Languages and runtimes
  { name: 'Java', category: 'language', aliases: [] },
  { name: '.NET', category: 'language', aliases: ['.NET Framework', '.NET Core', 'Dotnet', 'ASP.NET', 'ASP.NET Core'] },
  { name: 'C#', category: 'language', aliases: ['C Sharp', 'CSharp'] },
  { name: 'PHP', category: 'language', aliases: [] },
  { name: 'Python', category: 'language', aliases: [] },
  { name: 'JavaScript', category: 'language', aliases: ['JS', 'Java Script'] },
  { name: 'TypeScript', category: 'language', aliases: ['TS', 'Type Script'] },
  { name: 'Node.js', category: 'language', aliases: ['NodeJS', 'Node JS', 'Node'] },
  { name: 'Go', category: 'language', aliases: ['Golang'] },
  { name: 'Kotlin', category: 'language', aliases: [] },
  { name: 'Swift', category: 'language', aliases: [] },
  { name: 'Dart', category: 'language', aliases: [] },
  { name: 'HTML5', category: 'language', aliases: ['HTML'] },
  { name: 'CSS', category: 'language', aliases: ['CSS3'] },

  // Frameworks
  { name: 'React', category: 'framework', aliases: ['ReactJS', 'React.js', 'React JS'] },
  { name: 'Next.js', category: 'framework', aliases: ['NextJS', 'Next JS'] },
  { name: 'Angular', category: 'framework', aliases: ['AngularJS', 'Angular JS'] },
  { name: 'Vue.js', category: 'framework', aliases: ['Vue', 'VueJS', 'Vue JS'] },
  { name: 'Laravel', category: 'framework', aliases: [] },
  { name: 'Spring Boot', category: 'framework', aliases: ['Spring', 'Spring Framework', 'SpringBoot'] },
  { name: 'Django', category: 'framework', aliases: [] },
  { name: 'Express', category: 'framework', aliases: ['Express.js', 'ExpressJS'] },
  { name: 'Flutter', category: 'mobile', aliases: [] },
  { name: 'React Native', category: 'mobile', aliases: ['ReactNative'] },
  { name: 'Android', category: 'mobile', aliases: [] },
  { name: 'iOS', category: 'mobile', aliases: ['IOS', 'iPhone OS'] },

  // Cloud
  { name: 'Amazon Web Services', category: 'cloud', aliases: ['AWS'] },
  { name: 'Microsoft Azure', category: 'cloud', aliases: ['Azure'] },
  { name: 'Google Cloud', category: 'cloud', aliases: ['Google Cloud Platform', 'GCP'] },
  { name: 'GDCC', category: 'cloud', aliases: ['Government Data Center and Cloud', 'ระบบคลาวด์กลางภาครัฐ'] },

  // Data, BI and GIS
  { name: 'Power BI', category: 'bi-analytics', aliases: ['Microsoft Power BI', 'PowerBI'] },
  { name: 'Tableau', category: 'bi-analytics', aliases: [] },
  { name: 'Apache Kafka', category: 'bi-analytics', aliases: ['Kafka'] },
  { name: 'Apache Spark', category: 'bi-analytics', aliases: ['Spark'] },
  { name: 'Hadoop', category: 'bi-analytics', aliases: ['Apache Hadoop'] },
  { name: 'ArcGIS', category: 'gis', aliases: ['Esri ArcGIS', 'ArcGIS Enterprise', 'ArcGIS Server'] },
  { name: 'QGIS', category: 'gis', aliases: [] },
  { name: 'GeoServer', category: 'gis', aliases: ['Geo Server'] },

  // Business systems and collaboration
  { name: 'SAP', category: 'erp', aliases: ['SAP ERP', 'SAP S/4HANA', 'S/4HANA'] },
  { name: 'Microsoft 365', category: 'collaboration', aliases: ['Office 365', 'O365', 'M365'] },
  { name: 'Microsoft Active Directory', category: 'collaboration', aliases: ['Active Directory', 'AD', 'Microsoft AD'] },
  { name: 'LINE Official Account', category: 'messaging', aliases: ['LINE OA', 'LINE Official', 'LINE@'] },
  { name: 'LINE Messaging API', category: 'messaging', aliases: ['LINE API', 'LINE Notify'] },

  // Security and network
  { name: 'Fortinet FortiGate', category: 'security', aliases: ['FortiGate', 'Fortinet'] },
  { name: 'Palo Alto Networks', category: 'security', aliases: ['Palo Alto'] },
  { name: 'Cisco', category: 'network', aliases: [] },
  { name: 'Veeam Backup & Replication', category: 'security', aliases: ['Veeam'] },

  // Standards and protocols
  { name: 'REST API', category: 'standard', aliases: ['RESTful API', 'RESTful', 'REST'] },
  { name: 'SOAP', category: 'standard', aliases: ['SOAP Web Service'] },
  { name: 'GraphQL', category: 'standard', aliases: [] },
  { name: 'OAuth 2.0', category: 'standard', aliases: ['OAuth', 'OAuth2'] },
  { name: 'OpenID Connect', category: 'standard', aliases: ['OIDC'] },
  { name: 'LDAP', category: 'standard', aliases: [] },
  { name: 'HL7 FHIR', category: 'standard', aliases: ['FHIR', 'HL7'] },
];
