# 0010 · Normalized TOR Detail Information

Status: proposed

## Context

Government Terms of Reference (TOR) documents contain a mixture of
procurement, project, technical, administrative, and contractual information.

For the system to make government IT procurement opportunities easier to understand
and compare, the information contained in these documents needs to be
identified and organized into a consistent structure.

Different TORs may describe similar information using different terminology,
document structures, or levels of detail. Important information may also be
distributed across different sections of a document.

The system therefore needs a defined set of information that should be
identified from each TOR and represented in a normalized form.

The purpose of this decision is to define what information is considered
important to capture from a TOR. It does not define the database schema,
extraction implementation, or user interface.

## Decision

The system will identify and normalize the following
information categories from the source document:

- Project information
- Key procurement facts
- Project overview
- Contractor deliverables
- Technical requirements
- Integration and existing environment
- Implementation and operational requirements
- Bid eligibility and qualifications
- Contract and commercial conditions
- Decision-support analysis
- Amendment/status information
- Source and traceability

The original TOR document remains the authoritative source.

## Consequences

- The system has a defined information scope for government TOR documents.
- Similar information can be represented consistently across different TORs.
- Missing information can be distinguished from information that was not
present in the source document.
- The information requirements can serve as the basis for later extraction,
validation, database, and API design.
- Source information can be retained so that captured information remains
verifiable against the original TOR.
- Information generated completely by the system, such as profile matching, price analysis,
or lock-spec analysis, is treated separately from information stated in the
source document.
- The exact extraction method, database structure, API structure, and user
interface will be decided separately.