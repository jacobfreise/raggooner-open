package sumpf.web.backend.entity;

import jakarta.persistence.*;

import java.util.List;

@Entity
public class Team {

    @GeneratedValue
    @Id
    private Integer id;

    @ManyToOne
    @JoinColumn(name="captain_id")
    private Member captain;

    @OneToMany(mappedBy = "team", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TeamMember> teamMemberList;

    @ManyToOne
    @JoinColumn(name="tournament_id")
    private Tournament tournament;
}
