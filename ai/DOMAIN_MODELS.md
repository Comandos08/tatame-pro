DOMAIN_MODELS

Purpose:
Define the conceptual domain model used by Tatame Pro.

Claude must use this as the conceptual reference when interpreting the repository.

---

# CORE ENTITIES

Expected entities include:

Tenant  
User  
Role  
Academy  
Athlete  
Membership  
Graduation  
Competition  
Division  
Match  
Ranking  
Certificate  
DigitalCard

These entities define the martial arts governance model.

---

# TENANT

Represents an organization that owns data.

Examples:

federation  
academy network

All tenant-scoped data must reference tenant_id.

---

# USER

Represents authenticated system users.

Users may hold multiple roles.

Roles determine permissions.

---

# ACADEMY

Represents martial arts schools.

Relationships:

Academy → Athletes  
Academy → Coaches  

---

# ATHLETE

Represents martial arts practitioners.

Attributes include:

name  
birth date  
academy  
belt level  

Athletes participate in competitions and rankings.

---

# MEMBERSHIP

Represents federation affiliation.

Possible states:

Pending  
Active  
Suspended  
Expired  

Membership determines eligibility for events.

---

# GRADUATION

Represents belt promotions.

Attributes include:

belt  
date  
instructor  

Graduation records must preserve historical lineage.

---

# COMPETITION

Represents tournaments.

Contains:

divisions  
matches  
results  

Competition results feed ranking calculations.

---

# RANKING

Represents athlete ranking positions.

Ranking depends on:

competition results  
scoring rules  

Ranking must be deterministic.

---

# CERTIFICATE

Represents official recognition of achievements.

Examples include:

belt promotion certificates  
instructor certifications

Certificates must be verifiable.

---

# DIGITAL CARD

Represents digital athlete identity.

Contains:

athlete info  
graduation  
membership status

Used for verification during competitions.

---

# END OF DOMAIN_MODELS